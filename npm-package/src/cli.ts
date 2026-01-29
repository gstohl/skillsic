#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { spawn } from 'child_process';
import { getSkill, searchSkills, listSkillsFiltered, getStats } from './canister.js';
import { checkSafety, filterAnalyzedSkills, filterSafeSkills, sortBySafety } from './safety.js';
import type { Skill, SafetyLevel, SafetyCheck } from './types.js';
import { getTopicName, getFlagTypeName, getFlagSeverityName } from './types.js';

const VERSION = '1.0.0';

// Safety level colors and symbols
const safetyColors: Record<SafetyLevel, (text: string) => string> = {
  'safe': chalk.green,
  'caution': chalk.yellow,
  'warning': chalk.hex('#FFA500'), // orange
  'danger': chalk.red,
  'unknown': chalk.gray,
};

const safetySymbols: Record<SafetyLevel, string> = {
  'safe': '✓',
  'caution': '⚠',
  'warning': '⚠',
  'danger': '✗',
  'unknown': '?',
};

const safetyLabels: Record<SafetyLevel, string> = {
  'safe': 'SAFE',
  'caution': 'CAUTION',
  'warning': 'WARNING',
  'danger': 'DANGER',
  'unknown': 'UNKNOWN',
};

function formatSafetyBadge(level: SafetyLevel): string {
  const color = safetyColors[level];
  const symbol = safetySymbols[level];
  const label = safetyLabels[level];
  return color(`[${symbol} ${label}]`);
}

function formatRating(rating: number | null): string {
  if (rating === null) return chalk.gray('N/A');
  
  const stars = '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
  const ratingText = rating.toFixed(1);
  
  if (rating >= 4) return chalk.green(`${stars} ${ratingText}/5`);
  if (rating >= 3) return chalk.yellow(`${stars} ${ratingText}/5`);
  if (rating >= 2) return chalk.hex('#FFA500')(`${stars} ${ratingText}/5`);
  return chalk.red(`${stars} ${ratingText}/5`);
}

function formatScore(score: number | null, label: string): string {
  if (score === null) return chalk.gray(`${label}: N/A`);
  
  let color: (text: string) => string;
  if (score >= 80) color = chalk.green;
  else if (score >= 60) color = chalk.yellow;
  else if (score >= 40) color = chalk.hex('#FFA500');
  else color = chalk.red;
  
  return color(`${label}: ${score}/100`);
}

function printSkillHeader(skill: Skill): void {
  console.log();
  console.log(chalk.bold.cyan(`${skill.owner}/${skill.name}`));
  console.log(chalk.gray(`${skill.description}`));
  console.log();
}

function printSafetyReport(safety: SafetyCheck): void {
  console.log(formatSafetyBadge(safety.level));
  console.log();
  
  if (safety.isAnalyzed) {
    console.log(chalk.bold('Rating:'), formatRating(safety.overallRating));
    console.log(formatScore(safety.maliciousScore, 'Malicious check'));
    console.log(formatScore(safety.securityScore, 'Security'));
    console.log();
  }
  
  console.log(chalk.bold('Summary:'));
  console.log(`  ${safety.summary}`);
  console.log();
  
  if (safety.flags.length > 0) {
    console.log(chalk.bold('Flags:'));
    for (const flag of safety.flags) {
      const severity = getFlagSeverityName(flag.severity);
      const flagType = getFlagTypeName(flag.flag_type);
      const color = severity === 'Critical' ? chalk.red : 
                    severity === 'Warning' ? chalk.yellow : chalk.gray;
      console.log(`  ${color(`[${severity}]`)} ${flagType}: ${flag.message}`);
    }
    console.log();
  }
  
  if (safety.recommendations.length > 0) {
    console.log(chalk.bold('Recommendations:'));
    for (const rec of safety.recommendations) {
      console.log(`  • ${rec}`);
    }
    console.log();
  }
}

function printSkillSummary(skill: Skill, showSafety = true): void {
  const safety = checkSafety(skill);
  const badge = formatSafetyBadge(safety.level);
  const rating = formatRating(safety.overallRating);
  const installs = Number(skill.install_count).toLocaleString();
  
  console.log(`${badge} ${chalk.bold(skill.owner + '/' + skill.name)}`);
  console.log(`   ${chalk.gray(skill.description.slice(0, 80))}${skill.description.length > 80 ? '...' : ''}`);
  console.log(`   ${rating} | ${chalk.gray(`${installs} installs`)} | ${chalk.gray(skill.analysis?.primary_category || 'uncategorized')}`);
  console.log();
}

// ============================================================================
// Commands
// ============================================================================

program
  .name('skillsic')
  .description('Safety-first skill checker for Claude Code')
  .version(VERSION);

// Check command - check a specific skill
program
  .command('check <skill>')
  .description('Check the safety rating of a skill before installing')
  .option('-v, --verbose', 'Show detailed analysis')
  .action(async (skillId: string, options: { verbose?: boolean }) => {
    const spinner = ora('Checking skill safety...').start();
    
    try {
      const skill = await getSkill(skillId);
      spinner.stop();
      
      if (!skill) {
        console.log();
        console.log(chalk.red(`Skill not found: ${skillId}`));
        console.log();
        console.log(chalk.gray('Tips:'));
        console.log(chalk.gray('  • Use the format: owner/repo or owner/repo/name'));
        console.log(chalk.gray('  • Try searching: skillsic search <query>'));
        console.log();
        process.exit(1);
      }
      
      printSkillHeader(skill);
      
      const safety = checkSafety(skill);
      printSafetyReport(safety);
      
      if (options.verbose && skill.analysis) {
        console.log(chalk.bold('Analysis Details:'));
        console.log(`  Category: ${skill.analysis.primary_category}`);
        console.log(`  Tags: ${skill.analysis.tags.join(', ') || 'none'}`);
        console.log(`  Has MCP: ${skill.analysis.has_mcp ? 'Yes' : 'No'}`);
        console.log(`  Token Usage: ~${skill.analysis.estimated_token_usage.toLocaleString()}`);
        console.log();
        
        if (skill.analysis.use_cases.length > 0) {
          console.log(chalk.bold('Use Cases:'));
          for (const uc of skill.analysis.use_cases.slice(0, 3)) {
            console.log(`  • ${uc}`);
          }
          console.log();
        }
        
        if (skill.analysis.prerequisites.length > 0) {
          console.log(chalk.bold('Prerequisites:'));
          for (const prereq of skill.analysis.prerequisites) {
            console.log(`  • ${prereq}`);
          }
          console.log();
        }
      }
      
      // Exit code based on safety
      if (safety.level === 'danger') {
        process.exit(2);
      } else if (safety.level === 'warning') {
        process.exit(1);
      }
      
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('Error checking skill:'), error);
      process.exit(1);
    }
  });

// Add command - check safety and install if safe
program
  .command('add <skill>')
  .description('Find, check safety, and install a skill (can use search term or skill ID)')
  .option('-f, --force', 'Install even if skill has warnings (not danger)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (skillId: string, options: { force?: boolean; yes?: boolean }) => {
    const spinner = ora('Looking up skill...').start();
    
    try {
      // First try direct lookup by ID
      let skill = await getSkill(skillId);
      
      // If not found and doesn't look like an ID (no slash), try searching
      if (!skill && !skillId.includes('/')) {
        spinner.text = 'Searching for skill...';
        const results = await searchSkills(skillId);
        
        // Filter to safe/analyzed skills
        const safeResults = results
          .map(r => r.skill)
          .filter(s => s.analysis !== null)
          .filter(s => {
            const safety = checkSafety(s);
            return safety.level === 'safe' || safety.level === 'caution';
          });
        
        if (safeResults.length > 0) {
          skill = safeResults[0]; // Take the best match
          spinner.stop();
          console.log();
          console.log(chalk.gray(`Found matching skill: ${skill.owner}/${skill.name}`));
        } else if (results.length > 0) {
          // Has results but none are safe/analyzed
          skill = results[0].skill;
          spinner.stop();
          console.log();
          console.log(chalk.yellow(`Found "${skill.owner}/${skill.name}" but it hasn't been analyzed yet.`));
        }
      }
      
      spinner.stop();
      
      if (!skill) {
        console.log();
        console.log(chalk.red(`Skill not found: ${skillId}`));
        console.log();
        console.log(chalk.gray('Tips:'));
        console.log(chalk.gray('  • Use the format: owner/repo or owner/repo/name'));
        console.log(chalk.gray('  • Try searching: skillsic search <query>'));
        console.log();
        process.exit(1);
      }
      
      printSkillHeader(skill);
      
      const safety = checkSafety(skill);
      printSafetyReport(safety);
      
      // Determine if we should install
      const canInstall = safety.level === 'safe' || 
                         safety.level === 'caution' || 
                         (safety.level === 'warning' && options.force) ||
                         safety.level === 'unknown'; // Allow unknown if user wants to take risk
      
      if (safety.level === 'danger') {
        console.log(chalk.red.bold('Installation blocked: This skill has serious safety issues.'));
        console.log(chalk.gray('Use `skillsic check` for details, or find an alternative with `skillsic search`.'));
        console.log();
        process.exit(2);
      }
      
      if (safety.level === 'warning' && !options.force) {
        console.log(chalk.yellow.bold('Installation blocked: This skill has potential safety issues.'));
        console.log(chalk.gray('Use --force to install anyway, or find an alternative with `skillsic search`.'));
        console.log();
        process.exit(1);
      }
      
      if (safety.level === 'unknown' && !options.yes) {
        console.log(chalk.yellow('Warning: This skill has not been analyzed yet.'));
        console.log(chalk.gray('Consider requesting analysis at skillsic.com first.'));
        console.log();
      }
      
      // Build the install command
      // Format: npx skills add owner/repo --skill name (if name differs from repo)
      const installCmd = buildInstallCommand(skill);
      
      console.log(chalk.bold('Installing skill...'));
      console.log(chalk.gray(`Running: ${installCmd}`));
      console.log();
      
      // Execute the install command
      const exitCode = await runCommand(installCmd);
      
      if (exitCode === 0) {
        console.log();
        console.log(chalk.green.bold('✓ Skill installed successfully!'));
      } else {
        console.log();
        console.log(chalk.red(`Installation failed with exit code ${exitCode}`));
        process.exit(exitCode);
      }
      
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

/**
 * Build the npx skills add command for a skill
 */
function buildInstallCommand(skill: Skill): string {
  // If skill name equals repo name, simple format
  if (skill.name === skill.repo) {
    return `npx skills add ${skill.owner}/${skill.repo}`;
  }
  // Otherwise need --skill flag
  return `npx skills add ${skill.owner}/${skill.repo} --skill ${skill.name}`;
}

/**
 * Run a shell command and return the exit code
 */
function runCommand(cmd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, {
      shell: true,
      stdio: 'inherit',
    });
    
    child.on('close', (code) => {
      resolve(code ?? 1);
    });
    
    child.on('error', () => {
      resolve(1);
    });
  });
}

// Search command - search for safe skills
program
  .command('search <query>')
  .description('Search for skills (only shows analyzed/safe skills)')
  .option('-a, --all', 'Include unanalyzed skills')
  .option('-u, --unsafe', 'Include skills with warnings')
  .option('-l, --limit <number>', 'Limit results', '10')
  .action(async (query: string, options: { all?: boolean; unsafe?: boolean; limit?: string }) => {
    const spinner = ora('Searching skills...').start();
    
    try {
      const results = await searchSkills(query);
      spinner.stop();
      
      if (results.length === 0) {
        console.log();
        console.log(chalk.yellow('No skills found matching your query.'));
        console.log();
        process.exit(0);
      }
      
      let skills = results.map(r => r.skill);
      
      // Filter based on options
      if (!options.all) {
        const before = skills.length;
        skills = filterAnalyzedSkills(skills);
        if (skills.length < before) {
          console.log();
          console.log(chalk.gray(`(Filtered ${before - skills.length} unanalyzed skills. Use --all to include them)`));
        }
      }
      
      if (!options.unsafe) {
        const before = skills.length;
        skills = filterSafeSkills(skills);
        if (skills.length < before && options.all) {
          console.log(chalk.gray(`(Filtered ${before - skills.length} unsafe skills. Use --unsafe to include them)`));
        }
      }
      
      // Sort by safety
      skills = sortBySafety(skills);
      
      // Apply limit
      const limit = parseInt(options.limit || '10', 10);
      skills = skills.slice(0, limit);
      
      console.log();
      console.log(chalk.bold(`Found ${skills.length} skill${skills.length !== 1 ? 's' : ''}:`));
      console.log();
      
      for (const skill of skills) {
        printSkillSummary(skill);
      }
      
      console.log(chalk.gray('Use `skillsic check <skill>` for detailed safety info'));
      console.log();
      
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('Error searching skills:'), error);
      process.exit(1);
    }
  });

// Info command - show detailed skill info
program
  .command('info <skill>')
  .description('Show detailed information about a skill')
  .action(async (skillId: string) => {
    const spinner = ora('Fetching skill info...').start();
    
    try {
      const skill = await getSkill(skillId);
      spinner.stop();
      
      if (!skill) {
        console.log();
        console.log(chalk.red(`Skill not found: ${skillId}`));
        console.log();
        process.exit(1);
      }
      
      printSkillHeader(skill);
      
      const safety = checkSafety(skill);
      console.log(formatSafetyBadge(safety.level), formatRating(safety.overallRating));
      console.log();
      
      console.log(chalk.bold('Details:'));
      console.log(`  Owner: ${skill.owner}`);
      console.log(`  Repo: ${skill.repo}`);
      console.log(`  Stars: ${skill.stars.toLocaleString()}`);
      console.log(`  Installs: ${Number(skill.install_count).toLocaleString()}`);
      console.log(`  Source: ${skill.source}`);
      
      if (skill.github_url) {
        console.log(`  GitHub: ${skill.github_url}`);
      }
      console.log();
      
      if (skill.analysis) {
        const a = skill.analysis;
        console.log(chalk.bold('Analysis:'));
        console.log(`  Category: ${a.primary_category}`);
        if (a.secondary_categories.length > 0) {
          console.log(`  Also: ${a.secondary_categories.join(', ')}`);
        }
        console.log(`  Tags: ${a.tags.join(', ') || 'none'}`);
        console.log(`  Analyzed: ${new Date(Number(a.analyzed_at) / 1_000_000).toLocaleDateString()}`);
        console.log(`  Model: ${a.model_used}`);
        console.log();
        
        console.log(chalk.bold('Summary:'));
        console.log(`  ${a.summary}`);
        console.log();
        
        if (a.strengths.length > 0) {
          console.log(chalk.bold.green('Strengths:'));
          for (const s of a.strengths) {
            console.log(`  + ${s}`);
          }
          console.log();
        }
        
        if (a.weaknesses.length > 0) {
          console.log(chalk.bold.yellow('Weaknesses:'));
          for (const w of a.weaknesses) {
            console.log(`  - ${w}`);
          }
          console.log();
        }
        
        if (a.required_mcps.length > 0) {
          console.log(chalk.bold('Required MCPs:'));
          for (const mcp of a.required_mcps) {
            const status = mcp.verified ? chalk.green('✓ verified') : 
                          mcp.indexed ? chalk.yellow('indexed') : chalk.gray('external');
            console.log(`  • ${mcp.name} (${mcp.package}) [${status}]`);
          }
          console.log();
        }
        
        if (a.software_deps.length > 0) {
          console.log(chalk.bold('Software Dependencies:'));
          for (const dep of a.software_deps) {
            const required = dep.required ? chalk.red('required') : chalk.gray('optional');
            console.log(`  • ${dep.name} [${required}]`);
            if (dep.install_cmd) {
              console.log(chalk.gray(`    Install: ${dep.install_cmd}`));
            }
          }
          console.log();
        }
      }
      
      console.log(chalk.gray(`View on skillsic.com: https://skillsic.com/skill/${encodeURIComponent(skill.id)}`));
      console.log();
      
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('Error fetching skill info:'), error);
      process.exit(1);
    }
  });

// Stats command - show skillsic stats
program
  .command('stats')
  .description('Show skillsic platform statistics')
  .action(async () => {
    const spinner = ora('Fetching stats...').start();
    
    try {
      const stats = await getStats();
      spinner.stop();
      
      console.log();
      console.log(chalk.bold.cyan('skillsic.com Statistics'));
      console.log();
      console.log(`  Total Skills:    ${chalk.bold(stats.totalSkills.toLocaleString())}`);
      console.log(`  Analyzed Skills: ${chalk.bold(stats.analyzedSkills.toLocaleString())} (${((stats.analyzedSkills / stats.totalSkills) * 100).toFixed(1)}%)`);
      console.log(`  Total Installs:  ${chalk.bold(stats.totalInstalls.toLocaleString())}`);
      console.log(`  Users:           ${chalk.bold(stats.totalUsers.toLocaleString())}`);
      console.log();
      console.log(chalk.gray('Visit https://skillsic.com for more information'));
      console.log();
      
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('Error fetching stats:'), error);
      process.exit(1);
    }
  });

// Default action - show help
program.action(() => {
  console.log();
  console.log(chalk.bold.cyan('skillsic') + ' - Safety-first skill installer for Claude Code');
  console.log();
  console.log('Install a skill by name or search term:');
  console.log(chalk.gray('  $ skillsic add react'));
  console.log(chalk.gray('  $ skillsic add typescript'));
  console.log(chalk.gray('  $ skillsic add owner/repo/skill-name'));
  console.log();
  console.log('Search for skills:');
  console.log(chalk.gray('  $ skillsic search "react patterns"'));
  console.log();
  console.log('Check skill safety without installing:');
  console.log(chalk.gray('  $ skillsic check owner/skill-name'));
  console.log();
  console.log(chalk.gray('Run `skillsic --help` for all commands'));
  console.log();
});

program.parse();
