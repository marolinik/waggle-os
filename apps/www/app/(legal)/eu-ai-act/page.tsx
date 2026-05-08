import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

export const metadata: Metadata = {
  title: 'EU AI Act Statement — Waggle',
  description:
    'EU AI Act compliance statement for Waggle OS. Content pending Egzakta Group legal review.',
  robots: { index: false, follow: false },
};

export default function EuAiActPage() {
  return (
    <article>
      <h1 style={h1Style}>EU AI Act Statement</h1>
      <p style={pendingNoteStyle}>
        Content pending Egzakta Group legal review. This page is a scaffold
        placeholder; the final EU AI Act compliance statement will replace
        this copy before public launch.
      </p>
      <p style={paragraphStyle}>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aenean
        commodo ligula eget dolor. Aenean massa. Cum sociis natoque penatibus
        et magnis dis parturient montes, nascetur ridiculus mus. Donec quam
        felis, ultricies nec, pellentesque eu, pretium quis, sem.
      </p>
      <p style={paragraphStyle}>
        Nulla consequat massa quis enim. Donec pede justo, fringilla vel,
        aliquet nec, vulputate eget, arcu. In enim justo, rhoncus ut,
        imperdiet a, venenatis vitae, justo. Nullam dictum felis eu pede
        mollis pretium.
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
