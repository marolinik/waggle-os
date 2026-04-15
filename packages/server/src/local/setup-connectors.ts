/**
 * Connector registration — registers all built-in connectors.
 * Extracted from index.ts for readability.
 */

import {
  ConnectorRegistry,
  GitHubConnector, SlackConnector, JiraConnector, EmailConnector,
  GoogleCalendarConnector, DiscordConnector, LinearConnector,
  AsanaConnector, TrelloConnector, MondayConnector,
  NotionConnector, ConfluenceConnector, ObsidianConnector,
  HubSpotConnector, SalesforceConnector, PipedriveConnector,
  AirtableConnector, GitLabConnector, BitbucketConnector,
  DropboxConnector, PostgresConnector,
  GmailConnector, GoogleDocsConnector, GoogleDriveConnector, GoogleSheetsConnector,
  MSTeamsConnector, OutlookConnector, OneDriveConnector,
  ComposioConnector,
  MockSlackConnector, MockTeamsConnector, MockDiscordConnector,
} from '@waggle/agent';
import type { VaultStore } from '@waggle/core';

export function registerConnectors(vault: VaultStore): ConnectorRegistry {
  const registry = new ConnectorRegistry(vault);
  registry.register(new GitHubConnector());
  registry.register(new SlackConnector());
  registry.register(new JiraConnector());
  registry.register(new EmailConnector());
  registry.register(new GoogleCalendarConnector());
  registry.register(new DiscordConnector());
  registry.register(new LinearConnector());
  registry.register(new AsanaConnector());
  registry.register(new TrelloConnector());
  registry.register(new MondayConnector());
  registry.register(new NotionConnector());
  registry.register(new ConfluenceConnector());
  registry.register(new ObsidianConnector());
  registry.register(new HubSpotConnector());
  registry.register(new SalesforceConnector());
  registry.register(new PipedriveConnector());
  registry.register(new AirtableConnector());
  registry.register(new GitLabConnector());
  registry.register(new BitbucketConnector());
  registry.register(new DropboxConnector());
  registry.register(new PostgresConnector());
  registry.register(new GmailConnector());
  registry.register(new GoogleDocsConnector());
  registry.register(new GoogleDriveConnector());
  registry.register(new GoogleSheetsConnector());
  registry.register(new MSTeamsConnector());
  registry.register(new OutlookConnector());
  registry.register(new OneDriveConnector());
  registry.register(new ComposioConnector());
  // DEMO: Mock connectors for testing/demo mode — remove when real OAuth integrations are ready
  if (process.env.NODE_ENV !== 'production') {
    registry.register(new MockSlackConnector());
    registry.register(new MockTeamsConnector());
    registry.register(new MockDiscordConnector());
  }
  return registry;
}
