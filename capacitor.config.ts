import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'it.flussoapp',
  appName: 'Flusso',
  webDir: 'public',
  server: {
    url: 'https://www.flussoapp.it',
    cleartext: false,
  },
};

export default config;
