#!/usr/bin/env node
/**
 * Waggle Marketplace — CLI Interface
 * 
 * Usage:
 *   waggle-market search <query>        Search packages
 *   waggle-market install <name|id>     Install a package
 *   waggle-market install-pack <slug>   Install a capability pack
 *   waggle-market uninstall <name|id>   Uninstall a package
 *   waggle-market list                  List installed packages
 *   waggle-market packs                 List available packs
 *   waggle-market sources               List marketplace sources
 *   waggle-market sync [--source=x]     Sync from live sources
 *   waggle-market info <name|id>        Show package details
 */

import { MarketplaceDB } from './db';
import { MarketplaceInstaller } from './installer';
import { MarketplaceSync } from './sync';
import { SecurityGate } from './security';
import type { InstallationType } from './types';

const args = process.argv.slice(2);
const command = args[0];

// Parse flags
const flags: Record<string, string> = {};
for (const arg of args.slice(1)) {
  if (arg.startsWith('--')) {
    const [key, ...val] = arg.slice(2).split('=');
    flags[key] = val.join('=') || 'true';
  }
}

const positionals = args.slice(1).filter(a => !a.startsWith('--'));

async function main() {
  const db = new MarketplaceDB();
  const installer = new MarketplaceInstaller(db);

  try {
    switch (command) {
      case 'search':
      case 's': {
        const query = positionals.join(' ');
        const result = db.search({
          query: query || undefined,
          type: flags.type as InstallationType | undefined,
          category: flags.category,
          pack: flags.pack,
          limit: parseInt(flags.limit || '20'),
        });

        console.log(`\n📦 Found ${result.total} packages${query ? ` for "${query}"` : ''}:\n`);

        for (const pkg of result.packages) {
          const installed = db.isInstalled(pkg.id);
          const badge = installed ? '✅' : '  ';
          const type = pkg.waggle_install_type.toUpperCase().padEnd(7);
          console.log(`  ${badge} [${type}] ${pkg.display_name}`);
          console.log(`     ${pkg.description.slice(0, 80)}`);
          console.log(`     ⬇${pkg.downloads} ⭐${pkg.stars} | ${pkg.category} | ID: ${pkg.id}`);
          console.log();
        }

        console.log(`Types: ${Object.entries(result.facets.types).map(([k, v]) => `${k}(${v})`).join(', ')}`);
        break;
      }

      case 'install':
      case 'i': {
        const target = positionals[0];
        if (!target) {
          console.error('Usage: waggle-market install <name|id>');
          process.exit(1);
        }

        const pkg = isNaN(Number(target))
          ? db.search({ query: target, limit: 1 }).packages[0]
          : db.getPackage(Number(target));

        if (!pkg) {
          console.error(`Package "${target}" not found.`);
          process.exit(1);
        }

        console.log(`\n📥 Installing ${pkg.display_name} (${pkg.waggle_install_type})...`);

        const result = await installer.install({
          packageId: pkg.id,
          force: flags.force === 'true',
          forceInsecure: flags['force-insecure'] === 'true',
          settings: flags.settings ? JSON.parse(flags.settings) : undefined,
        });

        if (result.success) {
          console.log(`✅ ${result.message}`);
        } else {
          console.error(`❌ ${result.message}`);
          if (result.errors) result.errors.forEach(e => console.error(`   ${e}`));
          process.exit(1);
        }
        break;
      }

      case 'install-pack':
      case 'ip': {
        const slug = positionals[0];
        if (!slug) {
          console.error('Usage: waggle-market install-pack <slug>');
          process.exit(1);
        }

        console.log(`\n📦 Installing pack "${slug}"...`);
        const result = await installer.installPack(slug, { force: flags.force === 'true' });

        console.log(`\n${result.packName} — Installation Summary:`);
        console.log(`  ✅ Installed: ${result.installed.length}`);
        console.log(`  ⏭  Skipped:   ${result.skipped.length}`);
        console.log(`  ❌ Failed:    ${result.failed.length}`);

        if (result.installed.length > 0) {
          console.log('\nInstalled:');
          result.installed.forEach(r => console.log(`  • ${r.packageName} → ${r.installPath}`));
        }
        if (result.failed.length > 0) {
          console.log('\nFailed:');
          result.failed.forEach(r => console.log(`  • ${r.packageName}: ${r.message}`));
        }
        break;
      }

      case 'uninstall':
      case 'u': {
        const target = positionals[0];
        if (!target) {
          console.error('Usage: waggle-market uninstall <name|id>');
          process.exit(1);
        }

        const pkg = isNaN(Number(target))
          ? db.search({ query: target, limit: 1 }).packages[0]
          : db.getPackage(Number(target));

        if (!pkg) {
          console.error(`Package "${target}" not found.`);
          process.exit(1);
        }

        const result = await installer.uninstall(pkg.id);
        console.log(result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
        break;
      }

      case 'list':
      case 'ls': {
        const installations = db.listInstallations();
        if (installations.length === 0) {
          console.log('\nNo packages installed yet. Try: waggle-market search');
          break;
        }

        console.log(`\n📋 Installed packages (${installations.length}):\n`);
        for (const inst of installations) {
          console.log(`  • ${(inst as any).pkg_display_name} v${inst.installed_version}`);
          console.log(`    Type: ${(inst as any).waggle_install_type} | Path: ${inst.install_path}`);
          console.log(`    Installed: ${inst.installed_at}`);
          console.log();
        }
        break;
      }

      case 'packs': {
        const packs = db.listPacks();
        console.log(`\n🎯 Available Capability Packs (${packs.length}):\n`);
        for (const pack of packs) {
          const packData = db.getPacksBySlug(pack.slug);
          const count = packData?.packages.length || 0;
          console.log(`  ${pack.icon} ${pack.display_name} (${count} packages)`);
          console.log(`    ${pack.description}`);
          console.log(`    Roles: ${pack.target_roles} | Priority: ${pack.priority}`);
          console.log(`    Install: waggle-market install-pack ${pack.slug}`);
          console.log();
        }
        break;
      }

      case 'sources': {
        const sources = db.listSources();
        console.log(`\n🌐 Marketplace Sources (${sources.length}):\n`);
        for (const source of sources) {
          console.log(`  • ${source.display_name}`);
          console.log(`    ${source.url}`);
          console.log(`    Type: ${source.source_type} | Packages: ${source.total_packages} | Install: ${source.install_method}`);
          console.log();
        }
        break;
      }

      case 'sync': {
        const sync = new MarketplaceSync(db);
        const sourceFilter = flags.source ? [flags.source] : undefined;

        console.log('\n🔄 Syncing marketplace data...\n');
        const results = await sync.syncAll({ sources: sourceFilter });

        let totalAdded = 0;
        for (const result of results) {
          const status = result.errors.length > 0 ? '⚠️' : '✅';
          console.log(`  ${status} ${result.source}: +${result.added} packages`);
          if (result.errors.length > 0) {
            result.errors.forEach(e => console.log(`     ❌ ${e}`));
          }
          totalAdded += result.added;
        }

        console.log(`\n📊 Total: ${totalAdded} packages synced from ${results.length} sources`);
        break;
      }

      case 'info': {
        const target = positionals[0];
        if (!target) {
          console.error('Usage: waggle-market info <name|id>');
          process.exit(1);
        }

        const pkg = isNaN(Number(target))
          ? db.search({ query: target, limit: 1 }).packages[0]
          : db.getPackage(Number(target));

        if (!pkg) {
          console.error(`Package "${target}" not found.`);
          process.exit(1);
        }

        console.log(`\n📦 ${pkg.display_name}`);
        console.log(`${'─'.repeat(40)}`);
        console.log(`Name:        ${pkg.name}`);
        console.log(`Type:        ${pkg.waggle_install_type}`);
        console.log(`Category:    ${pkg.category}`);
        console.log(`Author:      ${pkg.author}`);
        console.log(`Version:     ${pkg.version}`);
        console.log(`License:     ${pkg.license || 'Unknown'}`);
        console.log(`Downloads:   ${pkg.downloads}`);
        console.log(`Stars:       ${pkg.stars}`);
        console.log(`Install to:  ${pkg.waggle_install_path}`);
        console.log(`Platforms:   ${pkg.platforms?.join(', ')}`);
        console.log(`Packs:       ${pkg.packs?.join(', ') || 'none'}`);
        if (pkg.repository_url) console.log(`Repository:  ${pkg.repository_url}`);
        if (pkg.homepage_url) console.log(`Homepage:    ${pkg.homepage_url}`);
        console.log(`\n${pkg.description}`);
        console.log(`\nInstalled:   ${db.isInstalled(pkg.id) ? '✅ Yes' : '❌ No'}`);
        break;
      }

      case 'scan': {
        const target = positionals[0];
        if (!target) {
          console.error('Usage: waggle-market scan <name|id>');
          process.exit(1);
        }

        const pkg = isNaN(Number(target))
          ? db.search({ query: target, limit: 1 }).packages[0]
          : db.getPackage(Number(target));

        if (!pkg) {
          console.error(`Package "${target}" not found.`);
          process.exit(1);
        }

        console.log(`\n🔍 Scanning ${pkg.display_name}...\n`);
        const report = await installer.getSecurityReport(pkg.id);
        console.log(report);
        break;
      }

      case 'scan-all': {
        const type = flags.type as InstallationType | undefined;
        const allPkgs = db.search({ type, limit: 999 }).packages;
        console.log(`\n🔍 Scanning ${allPkgs.length} packages...\n`);

        const stats = { clean: 0, low: 0, medium: 0, high: 0, critical: 0, errors: 0 };

        for (const pkg of allPkgs) {
          try {
            const result = await installer.scanOnly(pkg.id);
            if (result) {
              const key = result.overall_severity.toLowerCase() as keyof typeof stats;
              if (key in stats) stats[key]++;

              const icon = result.blocked ? '🚫' : result.overall_severity === 'CLEAN' ? '✅' :
                           result.overall_severity === 'LOW' ? '🔵' :
                           result.overall_severity === 'MEDIUM' ? '🟡' :
                           result.overall_severity === 'HIGH' ? '🟠' : '🔴';
              console.log(`  ${icon} ${pkg.display_name.padEnd(35)} ${result.overall_severity.padEnd(10)} ${result.security_score}/100`);
            }
          } catch {
            stats.errors++;
            console.log(`  ❓ ${pkg.display_name.padEnd(35)} ERROR`);
          }
        }

        console.log(`\n📊 Summary:`);
        console.log(`  ✅ Clean:    ${stats.clean}`);
        console.log(`  🔵 Low:      ${stats.low}`);
        console.log(`  🟡 Medium:   ${stats.medium}`);
        console.log(`  🟠 High:     ${stats.high}`);
        console.log(`  🔴 Critical: ${stats.critical}`);
        if (stats.errors > 0) console.log(`  ❓ Errors:   ${stats.errors}`);
        break;
      }

      case 'audit': {
        // Show security status of all packages in DB
        const results = db.search({ limit: 999 }).packages;
        const unscanned = results.filter(p => !(p as any).security_status || (p as any).security_status === 'unscanned');
        const blocked = results.filter(p => (p as any).scan_blocked === 1);
        const risky = results.filter(p => ['high', 'critical'].includes((p as any).security_status || ''));

        console.log(`\n🛡️  Marketplace Security Audit`);
        console.log(`${'─'.repeat(50)}`);
        console.log(`  Total packages:  ${results.length}`);
        console.log(`  Unscanned:       ${unscanned.length}`);
        console.log(`  Blocked:         ${blocked.length}`);
        console.log(`  High/Critical:   ${risky.length}`);
        console.log(`  Safe:            ${results.length - unscanned.length - blocked.length - risky.length}`);

        if (blocked.length > 0) {
          console.log('\n🚫 Blocked packages:');
          blocked.forEach(p => console.log(`  • ${p.display_name} (${(p as any).security_status})`));
        }
        if (risky.length > 0) {
          console.log('\n⚠️  Risky packages:');
          risky.forEach(p => console.log(`  • ${p.display_name} — score: ${(p as any).security_score}/100`));
        }
        if (unscanned.length > 0) {
          console.log(`\n💡 Run "waggle-market scan-all" to scan ${unscanned.length} unscanned packages.`);
        }
        break;
      }

      case 'security-config': {
        if (positionals.length === 0) {
          // Show current config
          const gate = new SecurityGate();
          console.log('\n🔧 Security Configuration:');
          console.log('  (edit ~/.waggle/security-config.json or use waggle-market security-config <key> <value>)');
          // Would read from security_config table
        } else if (positionals.length >= 2) {
          console.log(`  Set ${positionals[0]} = ${positionals[1]}`);
          // Would write to security_config table
        }
        break;
      }

      default:
        console.log(`
Waggle Marketplace CLI

Usage:
  waggle-market search <query>              Search packages
  waggle-market install <name|id>           Install a package
  waggle-market install-pack <slug>         Install a capability pack
  waggle-market uninstall <name|id>         Uninstall a package
  waggle-market list                        List installed packages
  waggle-market packs                       List available packs
  waggle-market sources                     List marketplace sources
  waggle-market sync [--source=<name>]      Sync from live sources
  waggle-market info <name|id>              Show package details

Security:
  waggle-market scan <name|id>              Scan a package for security issues
  waggle-market scan-all [--type=<type>]    Scan all packages in the database
  waggle-market audit                       Security audit summary
  waggle-market security-config             View/edit security settings

Flags:
  --type=<skill|plugin|mcp>   Filter by install type
  --category=<name>           Filter by category
  --pack=<slug>               Filter by pack membership
  --force                     Force reinstall
  --force-insecure            Bypass security gate (DANGEROUS)
  --limit=<n>                 Limit search results
        `);
    }
  } finally {
    db.close();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
