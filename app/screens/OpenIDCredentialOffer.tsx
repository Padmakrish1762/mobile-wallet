import {
  ClaimFormat,
  getCredentialForDisplay,
  openId4VcCredentialMetadataKey,
  receiveCredentialFromOpenId4VciOffer,
  SdJwtVcRecord,
  W3cCredentialRecord,
} from '@adeya/ssi'
import { BrandingOverlay } from '@hyperledger/aries-oca'
import { CredentialOverlay } from '@hyperledger/aries-oca/build/legacy'
import { StackScreenProps } from '@react-navigation/stack'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, DeviceEventEmitter, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'

import { saveHistory } from '../components/History/HistoryManager'
import { HistoryCardType, HistoryRecord } from '../components/History/types'
import OpenIDCredentialCard from '../components/OpenId/OpenIDCredentialCard'
import { useOpenIDCredentials } from '../components/Provider/OpenIDCredentialRecordProvider'
import Button, { ButtonType } from '../components/buttons/Button'
import CommonFooter from '../components/common/FooterButton'
import CommonRemoveModal from '../components/modals/CommonRemoveModal'
import W3CCredentialRecord from '../components/record/W3CCredentialRecord'
import { ToastType } from '../components/toast/BaseToast'
import { EventTypes } from '../constants'
import { useNetwork } from '../contexts/network'
import { useStore } from '../contexts/store'
import { useTheme } from '../contexts/theme'
import { BifoldError } from '../types/error'
import { NotificationStackParams, Screens, Stacks, TabStacks } from '../types/navigators'
import { W3CCredentialAttributeField } from '../types/record'
import { ModalUsage } from '../types/remove'
import { useAppAgent } from '../utils/agent'
import { buildFieldsFromJSONLDCredential, formatCredentialSubject } from '../utils/credential'
import { testIdWithKey } from '../utils/testable'

type OpenIdCredentialOfferProps = StackScreenProps<NotificationStackParams, Screens.OpenIdCredentialOffer>
type Query = { uri?: string; data?: string }
const OpenIdCredentialOffer: React.FC<OpenIdCredentialOfferProps> = ({ navigation, route }) => {
  if (!route?.params) {
    throw new Error('OpenIdCredentialOffer route params were not set properly')
  }
  const { agent } = useAppAgent()
  const { t } = useTranslation()
  const { ListItems } = useTheme()
  const { assertConnectedNetwork } = useNetwork()
  const [loading, setLoading] = useState<boolean>(true)
  const [buttonsVisible, setButtonsVisible] = useState(true)
  const [declineModalVisible, setDeclineModalVisible] = useState(false)
  const [overlay, setOverlay] = useState<CredentialOverlay<BrandingOverlay>>({ presentationFields: [] })
  const [tables, setTables] = useState<W3CCredentialAttributeField[]>([])
  const [credentialRecord, setCredentialRecord] = useState<W3cCredentialRecord | SdJwtVcRecord>()
  const [pinRequired, setPinRequired] = useState(false)
  const [pinValue, setPinValue] = useState('')
  const [pinError, setPinError] = useState<string | undefined>()
  const { storeOpenIdCredential } = useOpenIDCredentials()
  const [store] = useStore()
  const styles = StyleSheet.create({
    headerTextContainer: {
      paddingHorizontal: 25,
      paddingVertical: 16,
    },
    headerText: {
      ...ListItems.recordAttributeLabel,
      flexShrink: 1,
    },
    connectionLabel: {
      fontWeight: 'bold',
    },
    loader: {
      justifyContent: 'center',
      flex: 1,
    },
    pinContainer: {
      paddingHorizontal: 25,
      paddingVertical: 16,
    },
    pinInput: {
      borderWidth: 1,
      borderRadius: 8,
      borderColor: ListItems.recordAttributeLabel.color as string,
      color: ListItems.recordAttributeLabel.color as string,
      fontSize: 24,
      letterSpacing: 8,
      textAlign: 'center',
      paddingVertical: 12,
      marginBottom: 12,
    },
    pinError: {
      color: 'red',
      marginBottom: 12,
    },
  })

  const logHistoryRecord = useCallback(async () => {
    try {
      if (!(agent && store.preferences.useHistoryCapability)) {
        return
      }

      const type = HistoryCardType.CardAccepted
      if (!credentialRecord) {
        return
      }

      // Check if the metadata contains the key
      const hasOpenId4VcMetadata = Object.keys(credentialRecord?.metadata?.data || {}).includes(
        openId4VcCredentialMetadataKey,
      )

      if (hasOpenId4VcMetadata) {
        const firstName =
          credentialRecord?.metadata?.data[openId4VcCredentialMetadataKey]?.credential?.display?.[0]?.name
        /** Save history record for card accepted */
        const recordData: HistoryRecord = {
          type: type,
          message: type,
          createdAt: credentialRecord?.createdAt,
          correspondenceId: credentialRecord.id,
          correspondenceName: firstName,
        }
        await saveHistory(recordData, agent)
      }
    } catch (err: unknown) {
      // error when agent and preferences not getting
    }
  }, [agent, store.preferences.useHistoryCapability, credentialRecord])
  const requestCredential = useCallback(
    async (params: Query, pin?: string) => {
      try {
        setLoading(true)
        setPinError(undefined)
        const credentialRecord = await receiveCredentialFromOpenId4VciOffer({
          agent,
          data: params.data,
          uri: params.uri,
          pin,
        })
        setCredentialRecord(credentialRecord)
        setPinRequired(false)
      } catch (e: unknown) {
        agent.config.logger.error(`Couldn't receive credential from OpenID4VCI offer`, {
          error: e,
        })
        const message = (e as Error).message || ''
        // This offer requires a transaction code (PIN) that the wallet doesn't
        // know in advance - the issuer displays it out-of-band (e.g. in Studio
        // next to the QR code). Prompt for it instead of showing a hard error.
        // Credo's OpenId4VciHolderService doesn't pre-validate the pin client-side
        // like some other OID4VCI libraries do - it forwards straight to the token
        // endpoint and wraps the server's rejection as a CredoError mentioning
        // 'tx_code' (e.g. "...invalid_grant: Invalid 'tx_code' provided"), so that
        // has to be matched too, not just the client-side-check wording.
        if (message.includes('transaction code requirements') || message.toLowerCase().includes('tx_code')) {
          setPinRequired(true)
          if (pin) {
            setPinError(t('CredentialOffer.InvalidPin') || 'Incorrect PIN, please try again')
          }
          return
        }
        const error = new BifoldError(t('Error.Title1024'), t('Error.Message1024'), message, 1024)
        DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
        Toast.show({
          type: ToastType.Error,
          text1: t('Error.Title1024') || 'Error',
          text2: message || 'Failed to fetch credential offer',
        })
      } finally {
        setLoading(false)
      }
    },
    [agent, t],
  )

  useEffect(() => {
    requestCredential(route?.params)
  }, [])

  const handlePinSubmit = () => {
    requestCredential(route?.params, pinValue)
  }

  useEffect(() => {
    if (!credentialRecord) {
      return
    }
    const updateOpenIdCredentialPreview = () => {
      // getCredentialForDisplay().attributes is a flat claims object for both
      // W3C and SD-JWT credentials - formatCredentialSubject only needs a
      // plain object, so this works for either shape (the previous direct
      // `credential.credentialSubject` access only existed on W3C records).
      const { attributes } = getCredentialForDisplay(credentialRecord)
      const jsonLdValues = formatCredentialSubject(attributes)
      const fields = buildFieldsFromJSONLDCredential(attributes)
      setOverlay({ presentationFields: fields })
      setTables(jsonLdValues)
    }
    updateOpenIdCredentialPreview()
  }, [credentialRecord])
  const toggleDeclineModalVisible = () => setDeclineModalVisible(!declineModalVisible)
  const handleAcceptTouched = async () => {
    try {
      if (!(agent && credentialRecord && assertConnectedNetwork())) {
        return
      }
      if (credentialRecord instanceof W3cCredentialRecord) {
        credentialRecord.setTag('claimFormat', ClaimFormat.JwtVc)
      }
      await storeOpenIdCredential(agent, credentialRecord)
      logHistoryRecord()
      Toast.show({
        type: ToastType.Success,
        text1: t('CredentialOffer.CredentialAddedToWallet') || 'Credential added to wallet',
      })
      navigation.getParent()?.navigate(Stacks.TabStack, { screen: TabStacks.CredentialStack })
    } catch (err: unknown) {
      setButtonsVisible(true)
      const error = new BifoldError(t('Error.Title1024'), t('Error.Message1024'), (err as Error).message, 1024)
      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
      Toast.show({
        type: ToastType.Error,
        text1: t('Error.Title1024') || 'Error',
        text2: (err as Error).message,
      })
    }
  }
  const handleDeclineTouched = async () => {
    try {
      toggleDeclineModalVisible()
      navigation.getParent()?.navigate(TabStacks.HomeStack, { screen: Screens.Home })
    } catch (err: unknown) {
      const error = new BifoldError(t('Error.Title1025'), t('Error.Message1025'), (err as Error).message, 1025)
      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
    }
  }
  const openIdHeader = () => {
    // getCredentialForDisplay handles both W3cCredentialRecord and
    // SdJwtVcRecord shapes correctly - the previous manual claimFormat
    // branching only worked for W3C credentials and crashed for SD-JWT ones.
    const { display: showCredential } = getCredentialForDisplay(credentialRecord)
    return (
      <>
        <View style={styles.headerTextContainer}>
          <Text style={[styles.headerText]} testID={testIdWithKey('HeaderText')}>
            <Text style={styles.connectionLabel}>{showCredential.name || t('ContactDetails.AContact')}</Text>{' '}
            {t('CredentialOffer.IsOfferingYouACredential')}
          </Text>
        </View>
        {!loading && credentialRecord && (
          <View style={{ marginHorizontal: 15, marginBottom: 16 }}>
            <OpenIDCredentialCard credentialRecord={credentialRecord} />
          </View>
        )}
      </>
    )
  }
  const openIdFooter = () => {
    return (
      <CommonFooter
        loading={loading}
        buttonsVisible={buttonsVisible}
        handleAcceptTouched={handleAcceptTouched}
        toggleDeclineModalVisible={toggleDeclineModalVisible}
      />
    )
  }
  return (
    <SafeAreaView style={{ flexGrow: 1 }} edges={['bottom', 'left', 'right']}>
      {loading ? <ActivityIndicator style={styles.loader} size={'large'} /> : null}
      {!loading && pinRequired && !credentialRecord ? (
        <View style={styles.pinContainer}>
          <Text style={[styles.headerText, { marginBottom: 16 }]}>
            {t('CredentialOffer.EnterPin') || 'This issuer requires a PIN to accept the credential offer.'}
          </Text>
          <TextInput
            style={styles.pinInput}
            value={pinValue}
            onChangeText={setPinValue}
            keyboardType="number-pad"
            maxLength={8}
            autoFocus
            testID={testIdWithKey('CredentialOfferPin')}
            accessibilityLabel={t('CredentialOffer.EnterPin') || 'Enter PIN'}
          />
          {pinError && <Text style={styles.pinError}>{pinError}</Text>}
          <Button
            title={t('Global.Submit') || 'Submit'}
            buttonType={ButtonType.Primary}
            accessibilityLabel={t('Global.Submit') || 'Submit'}
            testID={testIdWithKey('SubmitCredentialOfferPin')}
            disabled={!pinValue.trim()}
            onPress={handlePinSubmit}
          />
        </View>
      ) : null}
      {credentialRecord ? (
        <W3CCredentialRecord
          tables={tables}
          fields={overlay.presentationFields || []}
          hideFieldValues={false}
          header={openIdHeader}
          footer={openIdFooter}
        />
      ) : null}
      <CommonRemoveModal
        usage={ModalUsage.CredentialOfferDecline}
        visible={declineModalVisible}
        onSubmit={handleDeclineTouched}
        onCancel={toggleDeclineModalVisible}
      />
    </SafeAreaView>
  )
}
export default OpenIdCredentialOffer
