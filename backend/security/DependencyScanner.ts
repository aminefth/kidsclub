import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

interface Vulnerability {
  name: string;
  version: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  description: string;
  recommendation: string;
  cve?: string;
}

interface ScanResult {
  vulnerabilities: Vulnerability[];
  totalPackages: number;
  vulnerablePackages: number;
  lastScan: Date;
  riskScore: number;
}

export class DependencyScanner {
  private static instance: DependencyScanner;
  private packageJsonPath: string;

  private constructor() {
    this.packageJsonPath = path.join(process.cwd(), 'package.json');
  }

  public static getInstance(): DependencyScanner {
    if (!DependencyScanner.instance) {
      DependencyScanner.instance = new DependencyScanner();
    }
    return DependencyScanner.instance;
  }

  /**
   * Scan dependencies for known vulnerabilities
   */
  public async scanDependencies(): Promise<ScanResult> {
    try {
      // Run npm audit
      const { stdout } = await execAsync('npm audit --json', { 
        cwd: process.cwd(),
        timeout: 30000 
      });
      
      const auditResult = JSON.parse(stdout);
      const vulnerabilities = this.parseNpmAudit(auditResult);
      
      // Get package count
      const packageJson = JSON.parse(await fs.readFile(this.packageJsonPath, 'utf-8'));
      const totalPackages = Object.keys({
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      }).length;

      const vulnerablePackages = new Set(vulnerabilities.map(v => v.name)).size;
      const riskScore = this.calculateRiskScore(vulnerabilities);

      return {
        vulnerabilities,
        totalPackages,
        vulnerablePackages,
        lastScan: new Date(),
        riskScore
      };
    } catch (error: any) {
      console.error('Dependency scan failed:', error.message);
      return {
        vulnerabilities: [],
        totalPackages: 0,
        vulnerablePackages: 0,
        lastScan: new Date(),
        riskScore: 0
      };
    }
  }

  /**
   * Check for outdated packages
   */
  public async checkOutdatedPackages(): Promise<any[]> {
    try {
      const { stdout } = await execAsync('npm outdated --json', { 
        cwd: process.cwd(),
        timeout: 30000 
      });
      
      const outdated = JSON.parse(stdout);
      return Object.entries(outdated).map(([name, info]: [string, any]) => ({
        name,
        current: info.current,
        wanted: info.wanted,
        latest: info.latest,
        location: info.location
      }));
    } catch (error) {
      // npm outdated returns exit code 1 when packages are outdated
      return [];
    }
  }

  /**
   * Get security recommendations
   */
  public getSecurityRecommendations(scanResult: ScanResult): string[] {
    const recommendations: string[] = [];

    if (scanResult.riskScore > 80) {
      recommendations.push('CRITICAL: Immediate action required - multiple high-severity vulnerabilities detected');
    } else if (scanResult.riskScore > 60) {
      recommendations.push('HIGH: Schedule security updates within 24 hours');
    } else if (scanResult.riskScore > 40) {
      recommendations.push('MEDIUM: Plan security updates within the week');
    }

    if (scanResult.vulnerablePackages > 0) {
      recommendations.push(`Update ${scanResult.vulnerablePackages} vulnerable packages`);
      recommendations.push('Run "npm audit fix" to automatically fix issues');
    }

    const criticalVulns = scanResult.vulnerabilities.filter(v => v.severity === 'critical');
    if (criticalVulns.length > 0) {
      recommendations.push(`Address ${criticalVulns.length} critical vulnerabilities immediately`);
    }

    return recommendations;
  }

  /**
   * Parse npm audit output
   */
  private parseNpmAudit(auditResult: any): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    if (auditResult.vulnerabilities) {
      Object.entries(auditResult.vulnerabilities).forEach(([name, vuln]: [string, any]) => {
        if (vuln.severity && vuln.severity !== 'info') {
          vulnerabilities.push({
            name,
            version: vuln.range || 'unknown',
            severity: vuln.severity,
            description: vuln.title || 'Security vulnerability detected',
            recommendation: vuln.fixAvailable ? 'Update available' : 'Manual review required',
            cve: vuln.cves?.[0]
          });
        }
      });
    }

    return vulnerabilities;
  }

  /**
   * Calculate risk score based on vulnerabilities
   */
  private calculateRiskScore(vulnerabilities: Vulnerability[]): number {
    let score = 0;
    
    vulnerabilities.forEach(vuln => {
      switch (vuln.severity) {
        case 'critical':
          score += 25;
          break;
        case 'high':
          score += 15;
          break;
        case 'moderate':
          score += 8;
          break;
        case 'low':
          score += 3;
          break;
      }
    });

    return Math.min(score, 100);
  }
}

export default DependencyScanner.getInstance();
