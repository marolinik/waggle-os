import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

export const metadata: Metadata = {
  title: 'Terms of Service — Waggle',
  description:
    'Terms of Service for Waggle OS. Content pending Egzakta Group legal review.',
  robots: { index: false, follow: false },
};

export default function TermsPage() {
  return (
    <article>
      <h1 style={h1Style}>Terms of Service</h1>
      <p style={pendingNoteStyle}>
        Content pending Egzakta Group legal review. This page is a scaffold
        placeholder; the final terms of service will replace this copy before
        public launch.
      </p>
      <p style={paragraphStyle}>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
        eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad
        minim veniam, quis nostrud exercitation ullamco laboris nisi ut
        aliquip ex ea commodo consequat. Duis aute irure dolor in
        reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla
        pariatur.
      </p>
      <p style={paragraphStyle}>
        Excepteur sint occaecat cupidatat non proident, sunt in culpa qui
        officia deserunt mollit anim id est laborum. Cras mattis consectetur
        purus sit amet fermentum. Donec sed odio dui.
      </p>
    </article>
  );
}

const h1Style: CSSProperties = {
  fontSize: 'clamp(28px, 4vw, 36px)',
  fontWeight: 700,
  marginBottom: 24,
  color: 'var(--hive-50, #f0f2f7)',
};

const pendingNoteStyle: CSSProperties = {
  fontSize: 13,
  fontStyle: 'italic',
  color: 'var(--honey-400, #f5b731)',
  background: 'rgba(229, 160, 0, 0.06)',
  border: '1px solid var(--honey-500, #e5a000)',
  borderRadius: 8,
  padding: '12px 16px',
  marginBottom: 24,
};

const paragraphStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.7,
  color: 'var(--hive-200, #b0b7cc)',
  marginBottom: 16,
};
