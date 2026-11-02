import {
  AnonCredsCredentialMetadataKey,
  CredentialExchangeRecord,
  CredentialState,
  GenericCredentialExchangeRecord,
  getAllW3cCredentialRecords,
  openId4VcCredentialMetadataKey,
  SdJwtVcRecord,
  useConnections,
  useCredentialByState,
  W3cCredentialRecord,
} from '@adeya/ssi'
import { useNavigation } from '@react-navigation/core'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, StyleSheet, View } from 'react-native'
import { widthPercentageToDP as wp } from 'react-native-responsive-screen'

import { useOpenIDCredentials } from '../components/Provider/OpenIDCredentialRecordProvider'
import ScanButton from '../components/common/ScanButton'
import CredentialCard from '../components/misc/CredentialCard'
import { OpenIDCredScreenMode } from '../constants'
import { useConfiguration } from '../contexts/configuration'
import { CredentialStackParams, Screens } from '../types/navigators'
import { useAppAgent } from '../utils/agent'

interface EnhancedW3CRecord extends W3cCredentialRecord {
  connectionLabel?: string
}

interface Props {
  isHorizontal?: boolean
}

const ListCredentials: React.FC<Props> = ({ isHorizontal = false }) => {
  const { t } = useTranslation()
  const { agent } = useAppAgent()
  const { credentialEmptyList: CredentialEmptyList } = useConfiguration()
  const {
    openIdState: { w3cCredentialRecords, sdJwtVcRecords },
  } = useOpenIDCredentials()
  const receivedCreds = useCredentialByState(CredentialState.CredentialReceived)
  const doneCreds = useCredentialByState(CredentialState.Done)
  const linkedW3cRecordIds = useMemo(() => {
    const ids = new Set<string>()
    ;[...receivedCreds, ...doneCreds].forEach(credential => {
      const credentialRecordId = (credential as any)?.credentials?.[0]?.credentialRecordId
      if (credentialRecordId) {
        ids.add(credentialRecordId)
      }
    })
    return ids
  }, [receivedCreds, doneCreds])
  // Exclude W3C records already represented by a DIDComm credential exchange record above,
  // otherwise the same credential renders twice (once per representation).
  const unlinkedW3cCredentialRecords = useMemo(
    () => w3cCredentialRecords.filter(record => !linkedW3cRecordIds.has(record.id)),
    [w3cCredentialRecords, linkedW3cRecordIds],
  )
  const credentials: GenericCredentialExchangeRecord[] = useMemo(
    // SD-JWT credentials only arrive via OID4VC in this app (no DIDComm
    // equivalent), so unlike W3C records there's no "already represented by
    // a DIDComm exchange record" case to de-duplicate against.
    () => [...receivedCreds, ...doneCreds, ...unlinkedW3cCredentialRecords, ...(sdJwtVcRecords || [])],
    [receivedCreds, doneCreds, unlinkedW3cCredentialRecords, sdJwtVcRecords],
  )
  const [credentialList, setCredentialList] = useState<(CredentialExchangeRecord | EnhancedW3CRecord)[] | undefined>([])
  const { records: connectionRecords } = useConnections()

  const navigation = useNavigation<StackNavigationProp<CredentialStackParams>>()

  useEffect(() => {
    let isMounted = true
    const updateCredentials = async () => {
      if (!agent) {
        return
      }

      let allW3c: W3cCredentialRecord[] = []
      try {
        allW3c = await getAllW3cCredentialRecords(agent)
      } catch (e) {
        // ignore
      }

      const updatedCredentials = credentials.map(credential => {
        const metaKeys = Object.keys(credential.metadata?.data || {})
        if (
          !metaKeys.includes(openId4VcCredentialMetadataKey) &&
          !metaKeys.includes(AnonCredsCredentialMetadataKey) &&
          (credential as any)?.credentials?.[0]?.credentialRecordId
        ) {
          const credentialRecordId = (credential as any)?.credentials?.[0]?.credentialRecordId
          try {
            const record = allW3c.find(record => record.id === credentialRecordId)
            const connection = connectionRecords.find(connection => connection.id === (credential as any)?.connectionId)
            const enhancedRecord = (record || credential) as EnhancedW3CRecord
            if (connection?.theirLabel) {
              enhancedRecord.connectionLabel = connection.theirLabel
            }
            return enhancedRecord
          } catch (e: unknown) {
            return credential
          }
        }
        return credential
      })
      if (isMounted) {
        setCredentialList(updatedCredentials as (CredentialExchangeRecord | EnhancedW3CRecord)[])
      }
    }

    updateCredentials()
    return () => {
      isMounted = false
    }
  }, [credentials, connectionRecords, agent])

  const styles = StyleSheet.create({
    container: { flex: 1, marginHorizontal: 10 },
    credentialList: { width: wp('100%'), height: wp('40%') },
    credentialsCardList: {},
    renderView: {
      marginRight: isHorizontal ? 20 : 0,
      marginTop: 15,
      width: isHorizontal ? wp('85%') : 'auto',
    },
    fabContainer: {
      position: 'absolute',
      bottom: 10,
      right: 10,
    },
  })

  return (
    <View style={styles.container}>
      <FlatList
        horizontal={isHorizontal}
        showsHorizontalScrollIndicator={false}
        style={isHorizontal ? styles.credentialList : styles.credentialsCardList}
        data={credentialList?.sort((a, b) => new Date(b.createdAt).valueOf() - new Date(a.createdAt).valueOf())}
        keyExtractor={credential => credential.id}
        renderItem={({ item: credential }) => {
          return (
            <View style={styles.renderView}>
              {credential instanceof CredentialExchangeRecord ? (
                <CredentialCard
                  credential={credential}
                  onPress={() =>
                    navigation.navigate(Screens.CredentialDetails, {
                      credential: credential as CredentialExchangeRecord,
                    })
                  }
                />
              ) : (
                <CredentialCard
                  schemaId={
                    credential instanceof SdJwtVcRecord
                      ? (credential as SdJwtVcRecord).getTags().vct
                      : (credential as W3cCredentialRecord).credential.type[1]
                  }
                  connectionLabel={(credential as EnhancedW3CRecord).connectionLabel}
                  credential={credential}
                  onPress={() => {
                    if (!Object.keys(credential.metadata.data).includes(openId4VcCredentialMetadataKey)) {
                      navigation.navigate(Screens.CredentialDetailsW3C, { credential: credential })
                    } else {
                      navigation.navigate(Screens.OpenIDCredentialDetails, {
                        credential: credential,
                        screenMode: OpenIDCredScreenMode.details,
                      })
                    }
                  }}
                />
              )}
            </View>
          )
        }}
        ListEmptyComponent={
          <View style={isHorizontal ? styles.credentialList : styles.credentialsCardList}>
            <CredentialEmptyList message={t('Credentials.EmptyCredentailsList')} />
          </View>
        }
      />
      {!isHorizontal && (
        <View style={styles.fabContainer}>
          <ScanButton />
        </View>
      )}
    </View>
  )
}

export default ListCredentials
