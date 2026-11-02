import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { check, PERMISSIONS, RESULTS } from 'react-native-permissions'

import PushNotificationsModal from '../components/modals/PushNotificationsModal'
import { setup, isUserDenied } from '../utils/PushNotificationHelper'
import { useAppAgent } from '../utils/agent'

const PushNotifications = () => {
  const { agent } = useAppAgent()
  const { t } = useTranslation()
  const [infoModalVisible, setInfoModalVisible] = useState(false)

  const setupPushNotifications = async () => {
    setInfoModalVisible(false)
    if (!agent || (await isUserDenied())) return
    setup(agent, false)
  }

  const initializeCapabilityRequest = async () => {
    if (!agent) return
    let needsPrompt = false
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        const hasPerm = (await check(PERMISSIONS.ANDROID.POST_NOTIFICATIONS)) === RESULTS.GRANTED
        if (!hasPerm && !(await isUserDenied())) {
          needsPrompt = true
        }
      } catch (e) {
        // Fallback
      }
    }

    if (needsPrompt) {
      setInfoModalVisible(true)
    } else {
      setup(agent, false)
    }
  }

  useEffect(() => {
    initializeCapabilityRequest()
  }, [agent])

  return (
    <PushNotificationsModal
      title={t('PushNotifications.Title')}
      visible={infoModalVisible}
      onDone={setupPushNotifications}
    />
  )
}

export default PushNotifications
