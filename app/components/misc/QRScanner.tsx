import Clipboard from '@react-native-clipboard/clipboard'
import { useNavigation } from '@react-navigation/core'
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWindowDimensions, Vibration, View, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native'
import { BarCodeReadEvent, RNCamera } from 'react-native-camera'
import Icon from 'react-native-vector-icons/MaterialIcons'

import { useTheme } from '../../contexts/theme'
import { QrCodeScanError } from '../../types/error'

import QRScannerClose from './QRScannerClose'
import QRScannerTorch from './QRScannerTorch'

interface Props {
  handleCodeScan: (event: BarCodeReadEvent) => Promise<void>
  error?: QrCodeScanError | null
  enableCameraOnError?: boolean
}

const CameraViewContainer: React.FC<{ portrait: boolean }> = ({ portrait, children }) => {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: portrait ? 'column' : 'row',
        alignItems: 'center',
      }}>
      {children}
    </View>
  )
}

const QRScanner: React.FC<Props> = ({ handleCodeScan, error, enableCameraOnError }) => {
  const navigation = useNavigation()
  const [cameraActive, setCameraActive] = useState(true)
  const scanningRef = useRef(false)
  const [torchActive, setTorchActive] = useState(false)
  const [manualUrl, setManualUrl] = useState('')
  const { width, height } = useWindowDimensions()
  const portraitMode = height > width
  const { t } = useTranslation()
  const invalidQrCodes = new Set<string>()
  const { ColorPallet, TextTheme } = useTheme()

  const submitManualUrl = (urlToSubmit: string) => {
    const trimmed = urlToSubmit.trim()
    if (!trimmed || scanningRef.current) return
    scanningRef.current = true
    handleCodeScan({ data: trimmed } as BarCodeReadEvent)
  }

  const handlePasteAndSubmit = async () => {
    const text = await Clipboard.getString()
    if (text && text.trim()) {
      setManualUrl(text.trim())
      submitManualUrl(text.trim())
    }
  }

  const styles = StyleSheet.create({
    container: {
      height: '100%',
      width: '100%',
      backgroundColor: ColorPallet.grayscale.black,
      justifyContent: 'center',
      alignItems: 'center',
    },
    viewFinder: {
      width: 220,
      height: 220,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: ColorPallet.grayscale.white,
    },
    viewFinderContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    icon: {
      color: ColorPallet.grayscale.white,
      padding: 4,
    },
    manualContainer: {
      width: '90%',
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 16,
      backgroundColor: 'rgba(0,0,0,0.75)',
      borderRadius: 12,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    input: {
      flex: 1,
      backgroundColor: ColorPallet.grayscale.white,
      color: ColorPallet.grayscale.black,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 13,
      marginRight: 8,
    },
    actionButton: {
      backgroundColor: ColorPallet.brand.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      marginLeft: 4,
    },
    actionButtonText: {
      color: ColorPallet.grayscale.white,
      fontWeight: 'bold',
      fontSize: 12,
    },
  })
  return (
    <View style={styles.container}>
      <RNCamera
        style={styles.container}
        type={RNCamera.Constants.Type.back}
        autoFocus={RNCamera.Constants.AutoFocus.on}
        flashMode={torchActive ? RNCamera.Constants.FlashMode.torch : RNCamera.Constants.FlashMode.off}
        captureAudio={false}
        androidCameraPermissionOptions={{
          title: t('QRScanner.PermissionToUseCamera'),
          message: t('QRScanner.WeNeedYourPermissionToUseYourCamera'),
          buttonPositive: t('QRScanner.Ok'),
          buttonNegative: t('Global.Cancel'),
        }}
        barCodeTypes={[RNCamera.Constants.BarCodeType.qr]}
        onBarCodeRead={(event: BarCodeReadEvent) => {
          if (!event?.data || scanningRef.current || invalidQrCodes.has(event.data)) {
            return
          }
          if (error?.data === event?.data) {
            invalidQrCodes.add(error.data)
            if (enableCameraOnError) {
              return setCameraActive(true)
            }
          }
          if (cameraActive) {
            scanningRef.current = true
            Vibration.vibrate()
            setCameraActive(false)
            handleCodeScan(event)
          }
        }}>
        <CameraViewContainer portrait={portraitMode}>
          <QRScannerClose onPress={() => navigation.goBack()}></QRScannerClose>
          <View style={styles.errorContainer}>
            {error ? (
              <>
                <Icon style={styles.icon} name="cancel" size={30}></Icon>
                <Text style={[TextTheme.caption, { color: ColorPallet.grayscale.white }]}>{error.message}</Text>
              </>
            ) : (
              <Text style={[TextTheme.caption, { color: ColorPallet.grayscale.white, height: 30, margin: 4 }]}> </Text>
            )}
          </View>
          <View style={styles.viewFinderContainer}>
            <View style={styles.viewFinder} />
          </View>
          <View style={styles.manualContainer}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Paste QR / Offer / Invitation URL..."
                placeholderTextColor="#888"
                value={manualUrl}
                onChangeText={setManualUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.actionButton} onPress={() => submitManualUrl(manualUrl)}>
                <Text style={styles.actionButtonText}>Go</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={handlePasteAndSubmit}>
                <Text style={styles.actionButtonText}>Paste</Text>
              </TouchableOpacity>
            </View>
          </View>
          <QRScannerTorch active={torchActive} onPress={() => setTorchActive(!torchActive)} />
        </CameraViewContainer>
      </RNCamera>
    </View>
  )
}

export default QRScanner
