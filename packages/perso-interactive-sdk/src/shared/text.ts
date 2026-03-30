import emojiRegex from 'emoji-regex';

const regex: RegExp = emojiRegex();

export function removeEmoji(str: string): string {
	return str.replace(regex, '');
}
