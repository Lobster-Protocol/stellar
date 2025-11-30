import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import { WalletNetwork } from '@creit.tech/stellar-wallets-kit';

interface WalletContextValue {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (txXdr: string, networkPassphrase: string) => Promise<string>;
  kit: StellarWalletsKit | null;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [kit, setKit] = useState<StellarWalletsKit | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isMounted = true;

    (async () => {
      try {
        const walletKitModule = await import('@creit.tech/stellar-wallets-kit');
        const { StellarWalletsKit: Kit, allowAllModules } = walletKitModule;
        const modules = allowAllModules();
        const instance = new Kit({
          network: WalletNetwork.PUBLIC,
          modules,
        });
        if (isMounted) setKit(instance);
      } catch (error) {
        console.error('Failed to initialise Stellar Wallets Kit', error);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const connect = async () => {
    if (!kit) throw new Error('Wallet kit not initialised');
    setIsConnecting(true);
    try {
      await kit.openModal({
        onWalletSelected: async (wallet) => {
          kit.setWallet(wallet.id);
          const { address: selectedAddress } = await kit.getAddress();
          setAddress(selectedAddress);
        },
        onClosed: (err) => {
          if (err) console.error('Wallet modal closed with error', err);
        },
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!kit) return;
    try {
      await kit.disconnect();
    } finally {
      setAddress(null);
    }
  };

  const signTransaction = async (txXdr: string, networkPassphrase: string) => {
    if (!kit || !address) throw new Error('Wallet not connected');
    const { signedTxXdr } = await kit.signTransaction(txXdr, {
      networkPassphrase,
      address,
    });
    return signedTxXdr;
  };

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      isConnected: Boolean(address),
      isConnecting,
      connect,
      disconnect,
      signTransaction,
      kit,
    }),
    [address, isConnecting, kit],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}

