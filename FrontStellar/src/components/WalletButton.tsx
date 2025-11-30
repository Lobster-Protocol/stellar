import { useWallet } from '../contexts/WalletContext';

export function WalletButton() {
  const { address, isConnected, isConnecting, connect, disconnect } = useWallet();

  const handleClick = async () => {
    try {
      if (isConnected) {
        await disconnect();
      } else {
        await connect();
      }
    } catch (error) {
      console.error('Wallet action failed', error);
    }
  };

  const formatAddress = (addr: string) => {
    if (!addr || addr.length < 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <button
      onClick={handleClick}
      disabled={isConnecting}
      className="btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        borderRadius: '0.75rem',
        border: '1px solid var(--color-border)',
        background: isConnected ? 'var(--color-primary-light)' : 'var(--color-bg-card)',
        color: isConnected ? 'var(--color-primary)' : 'var(--color-text-primary)',
        cursor: isConnecting ? 'not-allowed' : 'pointer',
      }}
    >
      {isConnecting
        ? 'Connecting...'
        : isConnected
        ? `Disconnect ${formatAddress(address!)}`
        : 'Connect wallet'}
    </button>
  );
}

