import { writable, derived } from 'svelte/store';
import { AuthClient } from '@dfinity/auth-client';
import { HttpAgent, Actor } from '@dfinity/agent';
import type { Principal } from '@dfinity/principal';

// Auth state
export const authClient = writable<AuthClient | null>(null);
export const isAuthenticated = writable(false);
export const userPrincipal = writable<Principal | null>(null);
export const hasApiKey = writable(false);

// Internet Identity URL
const II_URL = import.meta.env.PROD 
  ? 'https://identity.ic0.app'
  : 'http://localhost:4943?canisterId=rdmx6-jaaaa-aaaaa-aaadq-cai';

// Initialize auth client
export async function initAuth(): Promise<void> {
  const client = await AuthClient.create();
  authClient.set(client);
  
  const authenticated = await client.isAuthenticated();
  isAuthenticated.set(authenticated);
  
  if (authenticated) {
    const identity = client.getIdentity();
    userPrincipal.set(identity.getPrincipal());
    
    // Check if user has an API key stored on the canister
    try {
      const { hasApiKeyOnCanister } = await import('./canister');
      const agent = await getAgent();
      if (agent) {
        const hasKey = await hasApiKeyOnCanister(agent);
        hasApiKey.set(hasKey);
      }
    } catch (e) {
      console.error('Failed to check API key status during init:', e);
    }
  }
}

// Login with Internet Identity
export async function login(): Promise<boolean> {
  const client = await AuthClient.create();
  
  return new Promise((resolve) => {
    client.login({
      identityProvider: II_URL,
      onSuccess: () => {
        authClient.set(client);
        isAuthenticated.set(true);
        userPrincipal.set(client.getIdentity().getPrincipal());
        resolve(true);
      },
      onError: (error) => {
        console.error('Login failed:', error);
        resolve(false);
      },
    });
  });
}

// Logout
export async function logout(): Promise<void> {
  let client: AuthClient | null = null;
  const unsubscribe = authClient.subscribe(c => { client = c; });
  unsubscribe();
  
  if (client) {
    await (client as AuthClient).logout();
  }
  
  isAuthenticated.set(false);
  userPrincipal.set(null);
  hasApiKey.set(false);
}

// Get agent for canister calls
export async function getAgent(): Promise<HttpAgent | null> {
  let client: AuthClient | null = null;
  const unsubscribe = authClient.subscribe(c => { client = c; });
  unsubscribe();
  
  if (!client) return null;
  
  const identity = (client as AuthClient).getIdentity();
  const agent = new HttpAgent({ 
    identity,
    host: import.meta.env.PROD ? 'https://icp0.io' : 'http://127.0.0.1:4943',
  });
  
  // Fetch root key for local development
  if (!import.meta.env.PROD) {
    await agent.fetchRootKey();
  }
  
  return agent;
}

// Derived principal string
export const principalString = derived(userPrincipal, ($principal) => {
  if (!$principal) return null;
  const str = $principal.toString();
  if (str.length > 20) {
    return `${str.slice(0, 8)}...${str.slice(-8)}`;
  }
  return str;
});
