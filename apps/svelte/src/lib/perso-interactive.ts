import { ChatTool } from 'perso-interactive-sdk/client';

export class PersoInteractiveConfig {
	constructor(
		public persoInteractiveApiServerUrl: string,
		public sessionId: string,
		public chatbotWidth: number,
		public chatbotHeight: number,
		public enableVoiceChat: boolean,
		public introMessage: string,
		public clientTools: Array<ChatTool>
	) {}
}

// Loading the default ClientTools.
export function getDefaultClientTools(): Array<ChatTool> {
	// This ClientTool tells you the square of the queried number.
	const chatTool1 = new ChatTool(
		'get_square_number',
		'Returns the square of the given number',
		{
			type: 'object',
			properties: {
				number: {
					type: 'number',
					description: 'given number',
					examples: [3, 6, 9]
				}
			},
			required: ['number']
		},
		(arg: { number: number }) => {
			return { result: arg.number * arg.number };
		},
		false
	);
	// This ClientTool provides the current weather of the queried city.
	// This is a sample feature that always provides the same information regardless of the city queried.
	const chatTool2 = new ChatTool(
		'get_current_weather',
		'Retrieves the current weather for a given location',
		{
			type: 'object',
			properties: {
				location: {
					examples: ['New York, US', 'Seoul, KR'],
					type: 'string',
					description: "City and country, e.g. 'San Francisco, CA'"
				},
				units: {
					type: 'string',
					description: 'The temperature unit to use',
					enum: ['celsius', 'fahrenheit'],
					default: 'celsius'
				}
			},
			required: ['location', 'units']
		},
		async (arg: { location: string; units: string }) => {
			const location: string = arg.location;
			// convert string to Units, 'celsius' -> Units.CELSIUS
			const units = Object.values(Units).find((v) => v === arg.units);
			if (units === undefined) {
				return { result: 'failed' };
			}

			try {
				const weather = await getCurrentWeather(location, units);
				return {
					temperature: `${weather.temperature}${units === Units.CELSIUS ? '℃' : '℉'}`, // 30℃, 86℉
					condition: weather.condition, // 'Mostly clear'
					humidity: `${weather.humidity}%`, // 68%
					wind: `${weather.wind}km/h` // 10.3km/h
				};
			} catch (error) {
				return { result: 'failed' };
			}
		},
		false
	);
	// This ClientTool opens the admin dashboard.
	// This is a sample feature that logs a message when executed.
	const chatTool3 = new ChatTool(
		'show_settings',
		"Use ONLY for direct **COMMANDS** to open settings/admin screen (e.g., 'open settings', 'show admin'). MUST NOT be used for explanations or responses. Return values are machine-only JSON.",
		{
			type: 'object',
			properties: {}
		},
		(_arg: object) => {
			console.log('show admin page');
			return { action: 'show_settings', success: true };
		},
		true
	);
	// This ClientTool opens a map.
	// This is a sample that triggers an error when executed.
	const chatTool4 = new ChatTool(
		'show_map',
		"Use ONLY for direct **COMMANDS** to open map (e.g., 'open map', 'show map'). MUST NOT be used for explanations or responses. Return values are machine-only JSON.",
		{
			type: 'object',
			properties: {}
		},
		(_arg: object) => {
			console.log('show map');
			throw new Error('client tool4 error test');
		},
		true
	);

	return [chatTool1, chatTool2, chatTool3, chatTool4];
}

/**
 * Retrieves the current weather for a given location
 * @param location - City and country, e.g. 'San Francisco, CA' / examples: 'New York, US', 'Seoul, KR'
 * @param units - The temperature unit to use, enum Units
 * @returns Weather
 */
function getCurrentWeather(location: string, units: Units = Units.CELSIUS): Promise<Weather> {
	return new Promise<Weather>((resolve, reject) => {
		resolve({
			temperature: units === Units.CELSIUS ? 30 : 86,
			condition: 'Mostly clear',
			humidity: 68,
			wind: 10.3
		});
	});
}

enum Units {
	CELSIUS = 'celsius',
	FAHRENHEIT = 'fahrenheit'
}

interface Weather {
	temperature: number;
	condition: string;
	humidity: number;
	wind: number;
}
