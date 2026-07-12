import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DownloadCTA from '../app/_components/DownloadCTA';
import DownloadPage from '../app/download/page';
import { detectOSFromUserAgent } from '../app/_lib/os-detection';

afterEach(() => {
  cleanup();
});

describe('download path', () => {
  it('routes public download CTAs to the controlled download page', () => {
    render(<DownloadCTA section="hero" />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/download');
    expect(screen.getByRole('link')).not.toHaveAttribute('target');
  });

  it('does not send visitors directly to an empty GitHub Releases page', () => {
    render(<DownloadPage />);

    expect(
      screen.getByRole('heading', { name: 'Download Waggle' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Windows and macOS installers are being prepared for the signed public release.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'View source on GitHub' }),
    ).toHaveAttribute('href', 'https://github.com/marolinik/waggle-os');
    expect(
      screen.queryByRole('link', { name: /releases/i }),
    ).not.toBeInTheDocument();
  });

  it('does not label mobile visitors as desktop operating systems', () => {
    expect(
      detectOSFromUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      ),
    ).toBeNull();
    expect(
      detectOSFromUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
      ),
    ).toBeNull();
    expect(
      detectOSFromUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15',
      ),
    ).toBe('macOS');
    expect(
      detectOSFromUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      ),
    ).toBe('Windows');
  });
});
