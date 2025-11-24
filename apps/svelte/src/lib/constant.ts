import { env } from '$env/dynamic/private';

// Enter the API Server URL and API Key.
export const persoInteractiveApiServerUrl = 'https://live-api.perso.ai';

// Get env variable PERSO_INTERACTIVE_API_KEY from SvelteKit's env module
// Using .env file to store the API key for security reasons
export const persoInteractiveApiKey = env.PERSO_INTERACTIVE_API_KEY || '';
