import type { Metadata } from 'next';
import '@perso-interactive-sdk-web/design-system/styles/base.css';
import '@perso-interactive-sdk-web/design-system/styles/components.css';
import '@perso-interactive-sdk-web/design-system/styles/chat.css';
import './global.css';

export const metadata: Metadata = {
	title: 'SDK Playground — Next.js',
	icons: { icon: '/favicon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body>{children}</body>
		</html>
	);
}
