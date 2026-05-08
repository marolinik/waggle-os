import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

export const metadata: Metadata = {
  title: 'Privacy Policy — Waggle',
  description:
    'Privacy policy for Waggle OS. Content pending Egzakta Group legal review.',
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <article>
      <h1 style={h1Style}>Privacy Policy</h1>
      <p style={pendingNoteStyle}>
        Content pending Egzakta Group legal review. This page is a scaffold
        placeholder; the final privacy policy will replace this copy before
        public launch.
      </p>
      <p style={paragraphStyle}>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum
        ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia
        curae; Donec velit neque, auctor sit amet aliquam vel, ullamcorper sit
        amet ligula. Sed porttitor lectus nibh. Cras ultricies ligula sed
        magna dictum porta. Quisque velit nisi, pretium ut lacinia in,
        elementum id enim.
      </p>
      <p style={paragraphStyle}>
        Curabitur arcu erat, accumsan id imperdiet et, porttitor at sem.
        Vivamus suscipit tortor eget felis porttitor volutpat. Pellentesque in
        ipsum id orci porta dapibus. Mauris blandit aliquet elit, eget
        tincidunt nibh pulvinar a.
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
