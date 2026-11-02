import {
  addRecord,
  ClaimFormat,
  defaultState,
  openId4VcCredentialMetadataKey,
  OpenIDCredentialContext,
  OpenIDCredentialRecordState,
  recordsAddedByType,
  recordsRemovedByType,
  removeCredential,
  removeRecord,
  SdJwtVcRecord,
  storeOpenIdCredential,
  useAdeyaAgent,
  W3cCredentialRecord,
} from '@adeya/ssi'
import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react'

interface OpenIDCredentialProviderProps {
  children: React.ReactNode
}

const isW3CCredential = (record: W3cCredentialRecord): boolean => {
  try {
    const tags = record.getTags ? record.getTags() : ((record as any).tags ?? {})
    if (tags?.claimFormat === ClaimFormat.JwtVc) {
      return true
    }
    const meta = (record.metadata as any)?.data
    if (meta && (meta[openId4VcCredentialMetadataKey] || meta['openId4VcCredential'])) {
      return true
    }
    if (record.credential) {
      return true
    }
  } catch (e) {
    // ignore
  }
  return false
}

const filterW3CCredentials = (credentials: W3cCredentialRecord[]): W3cCredentialRecord[] => {
  return (credentials || []).filter(r => isW3CCredential(r))
}

const OpenIDCredentialRecordContext = createContext<OpenIDCredentialContext>(null as unknown as OpenIDCredentialContext)

export const OpenIDCredentialRecordProvider: React.FC<PropsWithChildren<OpenIDCredentialProviderProps>> = ({
  children,
}: OpenIDCredentialProviderProps) => {
  const [state, setState] = useState<OpenIDCredentialRecordState>(defaultState)

  const { agent } = useAdeyaAgent()

  useEffect(() => {
    if (!agent) {
      return
    }
    Promise.all([
      agent.w3cCredentials?.getAllCredentialRecords() ?? Promise.resolve([]),
      agent.sdJwtVc?.getAll() ?? Promise.resolve([]),
    ]).then(([w3cCredentialRecords, sdJwtVcRecords]) => {
      setState(prev => ({
        ...prev,
        w3cCredentialRecords: filterW3CCredentials(w3cCredentialRecords),
        sdJwtVcRecords,
        isLoading: false,
      }))
    })
  }, [agent])

  useEffect(() => {
    if (!state.isLoading && agent) {
      const credentialAdded$ = recordsAddedByType(agent, W3cCredentialRecord).subscribe(record => {
        //This handler will return ANY creds added to the wallet even DidComm
        //Sounds like a bug in the hooks package
        //This check will safe guard the flow untill a fix goes to the hooks
        if (isW3CCredential(record)) {
          setState(addRecord(record, state))
        }
      })

      const credentialRemoved$ = recordsRemovedByType(agent, W3cCredentialRecord).subscribe(record => {
        setState(removeRecord(record, state))
      })

      // The SDK's addRecord/removeRecord helpers only ever touch
      // w3cCredentialRecords (hardcoded), so SD-JWT records need their own
      // add/remove handling here to keep sdJwtVcRecords in sync.
      const sdJwtAdded$ = recordsAddedByType(agent, SdJwtVcRecord).subscribe(record => {
        setState(prev => ({ ...prev, sdJwtVcRecords: [record, ...prev.sdJwtVcRecords] }))
      })

      const sdJwtRemoved$ = recordsRemovedByType(agent, SdJwtVcRecord).subscribe(record => {
        setState(prev => ({
          ...prev,
          sdJwtVcRecords: prev.sdJwtVcRecords.filter(r => r.id !== record.id),
        }))
      })

      return () => {
        credentialAdded$.unsubscribe()
        credentialRemoved$.unsubscribe()
        sdJwtAdded$.unsubscribe()
        sdJwtRemoved$.unsubscribe()
      }
    }
  }, [state, agent])

  return (
    <OpenIDCredentialRecordContext.Provider
      value={{
        openIdState: state,
        storeOpenIdCredential: storeOpenIdCredential,
        removeCredential: removeCredential,
      }}>
      {children}
    </OpenIDCredentialRecordContext.Provider>
  )
}

export const useOpenIDCredentials = () => useContext(OpenIDCredentialRecordContext)
