import { useState, useEffect, useRef } from 'react';
import { Client as TokenClient } from '../../bindings/token';
import { Keypair } from '@stellar/stellar-sdk';

interface Token {
  contract: string;
  code: string;
  name: string;
}

interface TokenSelectorProps {
  value: string;
  onChange: (address: string, symbol: string) => void;
  tokens: Token[];
}

const runtimeEnv = (import.meta as { env?: Record<string, string> }).env ?? {};
const NETWORK = (runtimeEnv.VITE_NETWORK ?? 'testnet') as 'mainnet' | 'testnet';
const isMainnet = NETWORK === 'mainnet';
const RPC_URL = runtimeEnv.VITE_FACTORY_RPC ?? (
  isMainnet ? 'https://soroban-rpc.creit.tech' : 'https://soroban-testnet.stellar.org'
);
const NETWORK_PASSPHRASE = runtimeEnv.VITE_FACTORY_NETWORK ?? (
  isMainnet ? 'Public Global Stellar Network ; September 2015' : 'Test SDF Network ; September 2015'
);
const SECRET_KEY = runtimeEnv.VITE_SECRET ?? '';

const formatAddress = (address: string): string => {
  if (!address || address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

export function TokenSelector({ value, onChange, tokens }: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [pastedAddress, setPastedAddress] = useState('');
  const [isLoadingSymbol, setIsLoadingSymbol] = useState(false);
  const [customSymbol, setCustomSymbol] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredTokens = tokens.filter(
    (token) =>
      token.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      token.contract.toLowerCase().includes(searchTerm.toLowerCase()) ||
      token.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const selectedToken = tokens.find((t) => t.contract === value);

  const handleTokenSelect = (token: Token) => {
    onChange(token.contract, token.code);
    setIsOpen(false);
    setSearchTerm('');
    setPastedAddress('');
    setCustomSymbol(null);
  };

  const handlePasteAddress = async (address: string) => {
    setPastedAddress(address);
    if (!address || address.length < 10) {
      setCustomSymbol(null);
      return;
    }

    setIsLoadingSymbol(true);
    try {
      // symbol() is only simulated and nothing gets signed, so any public key works here.
      const keypair = SECRET_KEY ? Keypair.fromSecret(SECRET_KEY) : Keypair.random();

      const client = new TokenClient({
        contractId: address,
        rpcUrl: RPC_URL,
        networkPassphrase: NETWORK_PASSPHRASE,
        publicKey: keypair.publicKey(),
        signTransaction: async (txXdr: string) => ({
          signedTxXdr: txXdr,
          signerAddress: keypair.publicKey(),
        }),
      });

      const symbolTx = await client.symbol({ simulate: true });
      const symbolResult = symbolTx.result;
      const symbol = symbolResult?.toString() || 'UNKNOWN';
      setCustomSymbol(symbol);
      onChange(address, symbol);
    } catch (error) {
      console.error('Failed to fetch token symbol:', error);
      setCustomSymbol(null);
      // Still allow the address to be used even if symbol fetch fails
      onChange(address, '');
    } finally {
      setIsLoadingSymbol(false);
    }
  };

  const renderDisplayValue = () => {
    if (pastedAddress) {
      if (isLoadingSymbol) {
        return 'Loading token...';
      }
      const symbol = customSymbol || 'Custom';
      return (
        <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>{symbol}</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>{formatAddress(pastedAddress)}</span>
        </span>
      );
    }
    if (selectedToken) {
      return (
        <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>{selectedToken.code}</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>{formatAddress(selectedToken.contract)}</span>
        </span>
      );
    }
    return 'Select or paste token address';
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <div
          onClick={() => setIsOpen(!isOpen)}
          style={{
            padding: '0.75rem',
            border: '1px solid var(--color-border)',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            background: 'var(--color-bg-card)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ color: value ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
            {renderDisplayValue()}
          </span>
          <span style={{ fontSize: '0.75rem' }}>{isOpen ? '▲' : '▼'}</span>
        </div>

        <input
          type="text"
          placeholder="Or paste token address here"
          value={pastedAddress}
          onChange={(e) => handlePasteAddress(e.target.value)}
          onFocus={() => setIsOpen(false)}
          style={{
            padding: '0.75rem',
            border: '1px solid var(--color-border)',
            borderRadius: '0.5rem',
            background: 'var(--color-bg-card)',
            fontSize: '0.875rem',
          }}
        />
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '0.25rem',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '0.5rem',
            maxHeight: '300px',
            overflowY: 'auto',
            zIndex: 1000,
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <div style={{ padding: '0.5rem' }}>
            <input
              type="text"
              placeholder="Search tokens..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid var(--color-border)',
                borderRadius: '0.25rem',
                marginBottom: '0.5rem',
              }}
            />
          </div>
          <div>
            {filteredTokens.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                No tokens found
              </div>
            ) : (
              filteredTokens.map((token) => (
                <div
                  key={token.contract}
                  onClick={() => handleTokenSelect(token)}
                  style={{
                    padding: '0.75rem',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-primary-light)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.875rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{token.code}</span>
                      <span style={{ color: 'var(--color-text-secondary)' }}>{formatAddress(token.contract)}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{token.name}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

