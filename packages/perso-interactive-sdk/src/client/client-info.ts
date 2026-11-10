// rollup.config.js loads this as `{ version }` only, so the bundle never embeds
// the rest of package.json.
import pkg from '../../package.json';

interface BrandVersion {
	brand: string;
	version: string;
}

interface HighEntropyValues {
	platformVersion?: string;
	architecture?: string;
	model?: string;
	fullVersionList?: Array<BrandVersion>;
}

interface UserAgentData {
	platform: string;
	mobile: boolean;
	brands: Array<BrandVersion>;
	getHighEntropyValues?: (hints: Array<string>) => Promise<HighEntropyValues>;
}

/**
 * Runtime environment reported once per session so server logs can tie
 * issues to an SDK release, browser, OS and device.
 *
 * `user_agent` is the only source on Safari/Firefox and every iOS browser.
 * Its OS version is frozen (macOS "10_15_7", Windows "NT 10.0", Android
 * "10; K"), so on Chromium the real OS version and device model come from
 * high-entropy Client Hints. `max_touch_points` separates iPadOS, whose
 * default UA is identical to desktop Safari, from a Mac.
 */
export async function getClientInfo(): Promise<Record<string, unknown>> {
	const info: Record<string, unknown> = {
		type: 'client_info',
		sdk_version: pkg.version,
		user_agent: navigator.userAgent,
		max_touch_points: navigator.maxTouchPoints
	};

	const uaData = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;
	if (!uaData) return info;

	info.platform = uaData.platform;
	info.mobile = uaData.mobile;
	info.brands = uaData.brands;
	try {
		const high = await uaData.getHighEntropyValues?.([
			'platformVersion',
			'architecture',
			'model',
			'fullVersionList'
		]);
		if (high) {
			info.platform_version = high.platformVersion;
			info.architecture = high.architecture;
			info.model = high.model;
			info.full_version_list = high.fullVersionList;
		}
	} catch {
		// Low-entropy hints are still worth reporting.
	}
	return info;
}
