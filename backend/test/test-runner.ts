#!/usr/bin/env ts-node

import { spawn } from 'child_process';
import chalk from 'chalk';
import path from 'path';

interface TestSuite {
  name: string;
  pattern: string;
  description: string;
  timeout?: number;
}

const testSuites: TestSuite[] = [
  {
    name: 'Infrastructure',
    pattern: 'test/integration/health.test.ts',
    description: 'Health checks and system infrastructure tests',
    timeout: 30000
  },
  {
    name: 'Authentication',
    pattern: 'test/integration/auth.test.ts',
    description: 'User authentication and authorization tests',
    timeout: 45000
  },
  {
    name: 'Content Management',
    pattern: 'test/integration/blog.test.ts',
    description: 'Blog creation, management, and content tests',
    timeout: 60000
  },
  {
    name: 'Kids Safety',
    pattern: 'test/integration/kids-safety.test.ts',
    description: 'Kids content safety and educational features',
    timeout: 45000
  },
  {
    name: 'Monetization',
    pattern: 'test/integration/ads-monetization.test.ts',
    description: 'Advertising and monetization system tests',
    timeout: 45000
  },
  {
    name: 'AI Integration',
    pattern: 'test/integration/ai-integration.test.ts',
    description: 'AI services integration and functionality tests',
    timeout: 60000
  },
  {
    name: 'Performance',
    pattern: 'test/performance/load.test.ts',
    description: 'Performance and load testing',
    timeout: 120000
  },
  {
    name: 'End-to-End',
    pattern: 'test/e2e/user-journey.test.ts',
    description: 'Complete user journey and workflow tests',
    timeout: 90000
  }
];

interface TestResult {
  suite: string;
  passed: boolean;
  duration: number;
  output: string;
  error?: string;
}

class TestRunner {
  private results: TestResult[] = [];
  private startTime: number = 0;

  async runAllTests(): Promise<void> {
    console.log(chalk.blue.bold('\n🚀 KidsClub Backend QA Test Suite\n'));
    console.log(chalk.gray('Running comprehensive test suite...\n'));

    this.startTime = Date.now();

    for (const suite of testSuites) {
      await this.runTestSuite(suite);
    }

    this.printSummary();
  }

  async runTestSuite(suite: TestSuite): Promise<void> {
    console.log(chalk.yellow(`\n📋 Running ${suite.name} Tests`));
    console.log(chalk.gray(`   ${suite.description}`));
    console.log(chalk.gray(`   Pattern: ${suite.pattern}\n`));

    const startTime = Date.now();
    
    try {
      const result = await this.executeJest(suite);
      const duration = Date.now() - startTime;

      this.results.push({
        suite: suite.name,
        passed: result.success,
        duration,
        output: result.output,
        error: result.error
      });

      if (result.success) {
        console.log(chalk.green(`✅ ${suite.name} tests passed (${duration}ms)`));
      } else {
        console.log(chalk.red(`❌ ${suite.name} tests failed (${duration}ms)`));
        if (result.error) {
          console.log(chalk.red(`   Error: ${result.error}`));
        }
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.results.push({
        suite: suite.name,
        passed: false,
        duration,
        output: '',
        error: error.message
      });

      console.log(chalk.red(`❌ ${suite.name} tests failed with exception (${duration}ms)`));
      console.log(chalk.red(`   Error: ${error.message}`));
    }
  }

  private executeJest(suite: TestSuite): Promise<{ success: boolean; output: string; error?: string }> {
    return new Promise((resolve) => {
      const jestArgs = [
        '--testPathPattern', suite.pattern,
        '--verbose',
        '--detectOpenHandles',
        '--forceExit'
      ];

      if (suite.timeout) {
        jestArgs.push('--testTimeout', suite.timeout.toString());
      }

      const jest = spawn('npx', ['jest', ...jestArgs], {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'test'
        }
      });

      let output = '';
      let errorOutput = '';

      jest.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        process.stdout.write(chunk);
      });

      jest.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        process.stderr.write(chunk);
      });

      jest.on('close', (code) => {
        resolve({
          success: code === 0,
          output,
          error: code !== 0 ? errorOutput : undefined
        });
      });

      jest.on('error', (error) => {
        resolve({
          success: false,
          output,
          error: error.message
        });
      });
    });
  }

  private printSummary(): void {
    const totalDuration = Date.now() - this.startTime;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = this.results.filter(r => !r.passed).length;

    console.log(chalk.blue.bold('\n📊 Test Suite Summary'));
    console.log(chalk.gray('=' .repeat(50)));

    this.results.forEach(result => {
      const status = result.passed ? chalk.green('✅ PASS') : chalk.red('❌ FAIL');
      const duration = chalk.gray(`(${result.duration}ms)`);
      console.log(`${status} ${result.suite.padEnd(20)} ${duration}`);
    });

    console.log(chalk.gray('=' .repeat(50)));
    console.log(`Total Tests: ${chalk.blue(this.results.length)}`);
    console.log(`Passed: ${chalk.green(passedTests)}`);
    console.log(`Failed: ${chalk.red(failedTests)}`);
    console.log(`Duration: ${chalk.yellow(totalDuration + 'ms')}`);

    if (failedTests === 0) {
      console.log(chalk.green.bold('\n🎉 All tests passed! KidsClub backend is ready for production.'));
    } else {
      console.log(chalk.red.bold(`\n⚠️  ${failedTests} test suite(s) failed. Please review and fix issues.`));
      
      // Print failed test details
      const failedSuites = this.results.filter(r => !r.passed);
      if (failedSuites.length > 0) {
        console.log(chalk.red.bold('\nFailed Test Suites:'));
        failedSuites.forEach(suite => {
          console.log(chalk.red(`• ${suite.suite}: ${suite.error || 'Unknown error'}`));
        });
      }
    }

    console.log(chalk.gray('\n' + '='.repeat(50)));
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const runner = new TestRunner();

  if (args.length === 0) {
    // Run all tests
    await runner.runAllTests();
  } else {
    // Run specific test suite
    const suiteName = args[0].toLowerCase();
    const suite = testSuites.find(s => s.name.toLowerCase().includes(suiteName));
    
    if (suite) {
      console.log(chalk.blue.bold(`\n🎯 Running ${suite.name} Tests Only\n`));
      await runner.runTestSuite(suite);
      
      const result = runner['results'][0];
      if (result && result.passed) {
        console.log(chalk.green.bold('\n✅ Test suite passed!'));
        process.exit(0);
      } else {
        console.log(chalk.red.bold('\n❌ Test suite failed!'));
        process.exit(1);
      }
    } else {
      console.log(chalk.red(`❌ Test suite '${suiteName}' not found.`));
      console.log(chalk.yellow('\nAvailable test suites:'));
      testSuites.forEach(s => {
        console.log(chalk.gray(`• ${s.name.toLowerCase()} - ${s.description}`));
      });
      process.exit(1);
    }
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('Test runner failed:'), error);
    process.exit(1);
  });
}

export { TestRunner, testSuites };
