/**
 * Admin Configuration Service
 * Handles reading admin email configuration from secure local file
 */

import * as fs from 'fs';
import * as path from 'path';

interface AdminConfig {
  adminEmails: string[];
}

export class AdminConfigService {
  private static instance: AdminConfigService;
  private config: AdminConfig | null = null;
  private configPath: string;

  private constructor() {
    // Path to config file (outside of public src directory)
    this.configPath = path.join(process.cwd(), 'config', 'admin-emails.json');
  }

  public static getInstance(): AdminConfigService {
    if (!AdminConfigService.instance) {
      AdminConfigService.instance = new AdminConfigService();
    }
    return AdminConfigService.instance;
  }

  /**
   * Load admin configuration from file
   */
  private loadConfig(): AdminConfig {
    if (this.config) {
      return this.config;
    }

    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        this.config = JSON.parse(configData) as AdminConfig;
        return this.config;
      } else {
        console.warn('Admin emails config file not found, defaulting to empty list');
        this.config = { adminEmails: [] };
        return this.config;
      }
    } catch (error) {
      console.error('Error loading admin config:', error);
      this.config = { adminEmails: [] };
      return this.config;
    }
  }

  /**
   * Check if an email is in the admin list
   */
  public isAdminEmail(email: string): boolean {
    const config = this.loadConfig();
    return config.adminEmails.includes(email.toLowerCase());
  }

  /**
   * Get all admin emails
   */
  public getAdminEmails(): string[] {
    const config = this.loadConfig();
    return [...config.adminEmails];
  }

  /**
   * Reload config from file (useful for updates without restart)
   */
  public reloadConfig(): void {
    this.config = null;
    this.loadConfig();
  }
}