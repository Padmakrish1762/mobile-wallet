import { ConnectionRecord, getAllConnections, setPushNotificationDeviceInfo } from '@adeya/ssi'
import AsyncStorage from '@react-native-async-storage/async-storage'
import messaging from '@react-native-firebase/messaging'
import { Platform } from 'react-native'
import { Config } from 'react-native-config'
import { request, check, PERMISSIONS, RESULTS, PermissionStatus } from 'react-native-permissions'
import Toast from 'react-native-toast-message'

import { AdeyaAgent } from './agent'

const TOKEN_STORAGE_KEY = 'deviceToken'

/**
 * Handler Section
 */

const _foregroundHandler = (): (() => void) => {
  return messaging().onMessage(async remoteMessage => {
    // eslint-disable-next-line no-console
    console.log('Handling FCM foreground message:', remoteMessage)
    if (remoteMessage.notification) {
      Toast.show({
        type: 'info',
        text1: remoteMessage.notification.title || 'New Notification',
        text2: remoteMessage.notification.body || 'Open wallet to view details',
      })
    }
  })
}

/**
 * Permissions Section
 */

const _requestNotificationPermission = async (agent: AdeyaAgent): Promise<PermissionStatus> => {
  agent.config.logger.info('Requesting push notification permission...')
  const result = await request(PERMISSIONS.ANDROID.POST_NOTIFICATIONS)
  agent.config.logger.info(`push notification permission is now [${result}]`)
  return result
}

const _checkNotificationPermission = async (agent: AdeyaAgent): Promise<PermissionStatus> => {
  agent.config.logger.info('Checking push notification permission...')
  const result = await check(PERMISSIONS.ANDROID.POST_NOTIFICATIONS)
  agent.config.logger.info(`push notification permission is [${result}]`)
  return result
}

const _requestPermission = async (agent: AdeyaAgent): Promise<void> => {
  // IOS doesn't need the extra permission logic like android
  if (Platform.OS === 'ios') {
    await messaging().requestPermission()
    return
  }

  if (Platform.OS === 'android' && Platform.Version >= 33) {
    try {
      const checkPermission = await _checkNotificationPermission(agent)
      if (checkPermission === RESULTS.UNAVAILABLE) {
        agent.config.logger.warn(`push notification permission is not available on this device`)
        return
      }

      if (checkPermission !== RESULTS.GRANTED) {
        const reqResult = await _requestNotificationPermission(agent)
        if (reqResult !== RESULTS.GRANTED) {
          agent.config.logger.warn(`push notification permission was not granted by user: ${reqResult}`)
        }
      }
    } catch (err) {
      agent.config.logger.error(`Error requesting notification permission: ${err}`)
    }
  }
}

/**
 * Helper Functions Section
 */

const _getMediatorConnection = async (agent: AdeyaAgent): Promise<ConnectionRecord | undefined> => {
  const connections = await getAllConnections(agent)
  const targetLabel = Config.MEDIATOR_LABEL?.trim().toUpperCase()
  for (const connection of connections) {
    if (connection.theirLabel?.trim().toUpperCase() === targetLabel) {
      return connection
    }
  }
  agent.config.logger.warn(`Mediator connection with label [${Config.MEDIATOR_LABEL}] not found`)
  return undefined
}

/**
 * Checks wether the user denied permissions on the info modal
 * @returns {Promise<boolean>}
 */
const isUserDenied = async (): Promise<boolean> => {
  return (await AsyncStorage.getItem('userDeniedPushNotifications')) === 'true'
}

/**
 * Uses the discover didcomm protocol to check with the mediator if it supports the firebase push notification protocol
 * @param agent - The active aries agent
 * @returns {Promise<boolean>}
 */
const isMediatorCapable = async (agent: AdeyaAgent): Promise<boolean | undefined> => {
  if (!Config.MEDIATOR_LABEL || Config.MEDIATOR_USE_PUSH_NOTIFICATIONS === 'false') return false

  const mediator = await _getMediatorConnection(agent)
  if (!mediator) return false

  try {
    const response = await agent.discovery.queryFeatures({
      awaitDisclosures: true,
      connectionId: mediator.id,
      protocolVersion: 'v1',
      queries: [
        {
          featureType: 'protocol',
          match: 'https://didcomm.org/push-notifications-fcm/1.0',
        },
      ],
    })

    if (response.features && response.features?.length > 0) {
      await AsyncStorage.setItem('MEDIATOR_NOTIFICATION_SUPPORT', 'true')
      return true
    } else {
      await AsyncStorage.setItem('MEDIATOR_NOTIFICATION_SUPPORT', 'false')
      return false
    }
  } catch (e) {
    return false
  }
}

/**
 * Checks if the device token is already registered by checking the permission was granted and the storage key was used
 * @param token - If defined will use this token instead of fetching with firebase
 * @returns {Promise<boolean>}
 */
const isRegistered = async (): Promise<boolean> => {
  try {
    const authorized = (await messaging().hasPermission()) === messaging.AuthorizationStatus.AUTHORIZED

    // Need to register for push notification capability on iOS
    if (Platform.OS === 'ios' && !messaging().isDeviceRegisteredForRemoteMessages)
      await messaging().registerDeviceForRemoteMessages()

    if (authorized && (await AsyncStorage.getItem(TOKEN_STORAGE_KEY)) !== null) return true
  } catch (e) {
    // Ignore error
  }
  return false
}

/**
 * Checks if push notifications are enabled by checking if the stored token matches the expected firebase token
 * @returns {Promise<boolean>}
 */
const isEnabled = async (): Promise<boolean> => {
  try {
    const token = await messaging().getToken()
    const storedToken = await AsyncStorage.getItem(TOKEN_STORAGE_KEY)
    return token === storedToken
  } catch (e) {
    return false
  }
}

/**
 * Attempts to send the device token to the mediator agent. If the token is blank this is equivalent to disabling
 * @param agent - The active aries agent
 * @param blankDeviceToken - If true, will send an empty string as the device token to the mediator
 * @returns {Promise<void>}
 */
const setDeviceInfo = async (agent: AdeyaAgent, blankDeviceToken = false): Promise<void> => {
  try {
    let token = ''
    if (!blankDeviceToken) {
      token = await messaging().getToken()
    }
    // eslint-disable-next-line no-console
    console.warn('=== CREDEBL FCM DEVICE TOKEN ===', token)
    if (token) {
      await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token)
    }
    const mediator = await _getMediatorConnection(agent)
    if (!mediator) {
      agent.config.logger.warn('No mediator connection found for push notification device registration')
      return
    }

    if (!Config.CLIENT_CODE) {
      agent.config.logger.error('Client code is not set')
      return
    }

    agent.config.logger.info(`Trying to send device info to mediator with connection [${mediator.id}]`)
    await setPushNotificationDeviceInfo(agent, mediator.id, {
      deviceToken: token,
      devicePlatform: Platform.OS,
      clientCode: Config.CLIENT_CODE,
    })
    if (blankDeviceToken) await AsyncStorage.setItem(TOKEN_STORAGE_KEY, 'blank')
    else await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token)
  } catch (error) {
    agent.config.logger.error(`Error sending device token info to mediator agent: ${error}`)
  }
}

/**
 * Attempts to send the device token to the mediator agent, register handlers and requests permissions
 * @param agent - The active aries agent
 * @param blankDeviceToken - If true, will setup the device token as blank (disabled)
 * @returns {Promise<void>}
 */
const setup = async (agent: AdeyaAgent, blankDeviceToken = false): Promise<void> => {
  await _requestPermission(agent)
  await setDeviceInfo(agent, blankDeviceToken)
  _foregroundHandler()
}

export { isEnabled, isRegistered, isMediatorCapable, isUserDenied, setDeviceInfo, setup }
