import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';

export interface LocalNetworkInfoResult {
  ipv4Addresses: string[];
  preferredIp: string;
  isNativeAndroid: boolean;
}

export interface ManagedHotspotResult { started: boolean; ssid: string; password: string; hostIp: string; ipv4Addresses: string[]; }

export interface StartHostServerOptions {
  port: number;
  sessionCode: string;
}

export interface StartHostServerResult {
  started: boolean;
  port: number;
  hostIp: string;
  ipv4Addresses: string[];
}

export interface LocalHotspotPluginInterface {
  getLocalNetworkInfo(): Promise<LocalNetworkInfoResult>;
  startManagedHotspot(): Promise<ManagedHotspotResult>;
  stopManagedHotspot(): Promise<void>;
  connectToManagedHotspot(options: { ssid: string; password: string }): Promise<{ connected: boolean }>;
  disconnectManagedHotspot(): Promise<void>;
  startHostServer(options: StartHostServerOptions): Promise<StartHostServerResult>;
  stopHostServer(): Promise<void>;
  sendToClient(options: { clientId: string; payload: string }): Promise<void>;
  broadcast(options: { payload: string }): Promise<void>;
  addListener(
    eventName: 'clientConnected',
    listenerFunc: (event: { clientId: string; remoteAddress: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'clientDisconnected',
    listenerFunc: (event: { clientId: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'messageReceived',
    listenerFunc: (event: { clientId: string; payload: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'serverError',
    listenerFunc: (event: { message: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeLocalHotspot =
  registerPlugin<LocalHotspotPluginInterface>('LocalHotspot');

export function isNativeAndroidEnvironment(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function getDeviceHotspotNetworkInfo(): Promise<LocalNetworkInfoResult> {
  if (!isNativeAndroidEnvironment()) {
    return {
      ipv4Addresses: ['192.168.43.1'],
      preferredIp: '192.168.43.1',
      isNativeAndroid: false,
    };
  }
  return NativeLocalHotspot.getLocalNetworkInfo();
}

export { NativeLocalHotspot };
