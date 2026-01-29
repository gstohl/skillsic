import type { Skill, SafetyCheck, SafetyLevel, RatingFlag } from './types.js';
import { getTopicName, getFlagTypeName, getFlagSeverityName } from './types.js';

/**
 * Analyze a skill's safety based on its analysis data
 */
export function checkSafety(skill: Skill): SafetyCheck {
  const analysis = skill.analysis;
  
  // If no analysis, we can't determine safety
  if (!analysis) {
    return {
      level: 'unknown',
      overallRating: null,
      maliciousScore: null,
      securityScore: null,
      flags: [],
      isAnalyzed: false,
      summary: 'This skill has not been analyzed yet. Safety cannot be determined.',
      recommendations: [
        'Visit skillsic.com to request an analysis',
        'Review the skill\'s source code manually before installing',
        'Consider using an analyzed alternative'
      ],
    };
  }

  const { overall, topics, flags } = analysis.ratings;
  
  // Extract key safety scores
  let maliciousScore: number | null = null;
  let securityScore: number | null = null;
  
  for (const topic of topics) {
    const topicName = getTopicName(topic.topic);
    if (topicName === 'Malicious') {
      maliciousScore = topic.score;
    } else if (topicName === 'Security') {
      securityScore = topic.score;
    }
  }

  // Determine safety level
  const level = determineSafetyLevel(overall, maliciousScore, securityScore, flags);
  
  // Generate summary and recommendations
  const { summary, recommendations } = generateSummary(level, skill, analysis);

  return {
    level,
    overallRating: overall,
    maliciousScore,
    securityScore,
    flags,
    isAnalyzed: true,
    summary,
    recommendations,
  };
}

function determineSafetyLevel(
  overall: number,
  maliciousScore: number | null,
  securityScore: number | null,
  flags: RatingFlag[]
): SafetyLevel {
  // Check for critical flags first
  const hasCriticalFlag = flags.some(f => 
    getFlagSeverityName(f.severity) === 'Critical'
  );
  
  const hasMaliciousPattern = flags.some(f =>
    getFlagTypeName(f.flag_type) === 'MaliciousPattern'
  );

  if (hasMaliciousPattern || (maliciousScore !== null && maliciousScore < 30)) {
    return 'danger';
  }

  if (hasCriticalFlag || (securityScore !== null && securityScore < 30)) {
    return 'danger';
  }

  // Check for warning-level issues
  const hasWarningFlag = flags.some(f =>
    getFlagSeverityName(f.severity) === 'Warning'
  );

  if (hasWarningFlag || (maliciousScore !== null && maliciousScore < 60)) {
    return 'warning';
  }

  if (securityScore !== null && securityScore < 60) {
    return 'warning';
  }

  // Check for caution
  if (overall < 3.0 || (maliciousScore !== null && maliciousScore < 80)) {
    return 'caution';
  }

  if (securityScore !== null && securityScore < 80) {
    return 'caution';
  }

  // All good
  if (overall >= 3.5 && (maliciousScore === null || maliciousScore >= 80)) {
    return 'safe';
  }

  return 'caution';
}

function generateSummary(
  level: SafetyLevel,
  skill: Skill,
  analysis: NonNullable<Skill['analysis']>
): { summary: string; recommendations: string[] } {
  const { overall, flags } = analysis.ratings;
  const recommendations: string[] = [];

  let summary: string;

  switch (level) {
    case 'danger':
      summary = `WARNING: This skill has serious safety concerns and should NOT be installed.`;
      recommendations.push('Do NOT install this skill');
      recommendations.push('Report this skill at skillsic.com if you believe it\'s malicious');
      
      // Add specific flag messages
      for (const flag of flags) {
        if (getFlagSeverityName(flag.severity) === 'Critical') {
          recommendations.push(`Critical: ${flag.message}`);
        }
      }
      break;

    case 'warning':
      summary = `This skill has potential safety issues that require attention.`;
      recommendations.push('Review the skill\'s source code before installing');
      recommendations.push('Consider using a safer alternative');
      
      for (const flag of flags) {
        if (getFlagSeverityName(flag.severity) === 'Warning') {
          recommendations.push(`Warning: ${flag.message}`);
        }
      }
      break;

    case 'caution':
      summary = `This skill is generally safe but has some areas of concern.`;
      recommendations.push('Review the flagged areas before installing');
      
      if (overall < 3.5) {
        recommendations.push(`Overall rating is ${overall.toFixed(1)}/5.0 - consider alternatives`);
      }
      break;

    case 'safe':
      summary = `This skill has been analyzed and appears to be safe.`;
      recommendations.push('Always review skills periodically for updates');
      break;

    default:
      summary = 'Safety status could not be determined.';
      recommendations.push('Visit skillsic.com for more information');
  }

  // Add strengths if safe
  if (level === 'safe' && analysis.strengths.length > 0) {
    recommendations.push(`Strengths: ${analysis.strengths.slice(0, 2).join(', ')}`);
  }

  // Add weaknesses if there are any
  if (analysis.weaknesses.length > 0 && level !== 'safe') {
    recommendations.push(`Weaknesses: ${analysis.weaknesses.slice(0, 2).join(', ')}`);
  }

  return { summary, recommendations };
}

/**
 * Filter skills to only include those that have been analyzed
 */
export function filterAnalyzedSkills(skills: Skill[]): Skill[] {
  return skills.filter(s => s.analysis !== null);
}

/**
 * Filter skills to only include safe ones (safe or caution level)
 */
export function filterSafeSkills(skills: Skill[]): Skill[] {
  return skills.filter(s => {
    if (!s.analysis) return false;
    const safety = checkSafety(s);
    return safety.level === 'safe' || safety.level === 'caution';
  });
}

/**
 * Sort skills by safety rating (safest first)
 */
export function sortBySafety(skills: Skill[]): Skill[] {
  const levelOrder: Record<SafetyLevel, number> = {
    'safe': 0,
    'caution': 1,
    'warning': 2,
    'danger': 3,
    'unknown': 4,
  };

  return [...skills].sort((a, b) => {
    const safetyA = checkSafety(a);
    const safetyB = checkSafety(b);
    
    const levelDiff = levelOrder[safetyA.level] - levelOrder[safetyB.level];
    if (levelDiff !== 0) return levelDiff;
    
    // If same level, sort by overall rating
    const ratingA = safetyA.overallRating ?? 0;
    const ratingB = safetyB.overallRating ?? 0;
    return ratingB - ratingA;
  });
}
