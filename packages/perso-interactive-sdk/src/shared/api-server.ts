export const DEFAULT_API_SERVER = 'https://platform.perso.ai';

export function resolveApiServer(apiServer?: string): string {
	const trimmed = apiServer?.trim();
	const url = trimmed ? trimmed : DEFAULT_API_SERVER;
	return url.replace(/\/+$/, '');
}
