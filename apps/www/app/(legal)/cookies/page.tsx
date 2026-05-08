import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

export const metadata: Metadata = {
  title: 'Cookie Policy — Waggle',
  description:
    'Cookie policy for Waggle OS. Content pending Egzakta Group legal review.',
  robots: { index: false, follow: false },
};

export default function CookiesPage() {
  return (
    <article>
      <h1 style={h1Style}>Cookie Policy</h1>
      <p style={pendingNoteStyle}>
        Content pending Egzakta Group legal review. This page is a scaffold
        placeholder; the final cookie policy will replace this copy before
        public launch.
      </p>
      <p style={paragraphStyle}>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus
        sodales massa malesuada tellus fringilla, nec bibendum tellus
        charisma. Sed lectus orci, sodales eu vehicula vel, lobortis at
        velit. Vivamus volutpat suscipit erat, sed pharetra est varius eu.
      </p>
      <p style={paragraphStyle}>
        Aliquam erat volutpat. Pellentesque habitant morbi tristique senectus
        et netus et malesuada fames ac turpis egestas. Donec id enim ut justo
        rhoncus consequat at quis nibh.
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
