/**
 * Crypto utilities using Web Crypto API (Cloudflare Workers compatible)
 */

export class PasswordCrypto {
  private static readonly SALT_LENGTH = 16;
  private static readonly ITERATIONS = 100000;
  private static readonly KEY_LENGTH = 32;

  /**
   * Hash a password using PBKDF2 with SHA-256
   */
  static async hashPassword(password: string): Promise<string> {
    // Generate a random salt
    const salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));

    // Convert password to ArrayBuffer
    const passwordBuffer = new TextEncoder().encode(password);

    // Import the password as a key
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    // Derive the key using PBKDF2
    const derivedKey = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: this.ITERATIONS,
        hash: 'SHA-256'
      },
      passwordKey,
      this.KEY_LENGTH * 8
    );

    // Combine salt and derived key
    const combined = new Uint8Array(salt.length + derivedKey.byteLength);
    combined.set(salt);
    combined.set(new Uint8Array(derivedKey), salt.length);

    // Convert to base64 using a more reliable method for Cloudflare Workers
    let binaryString = '';
    for (let i = 0; i < combined.length; i++) {
      binaryString += String.fromCharCode(combined[i]);
    }
    return btoa(binaryString);
  }

  /**
   * Verify a password against a hash (supports both new Web Crypto and legacy bcrypt hashes)
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      // Check if this is a legacy bcrypt hash (starts with $2a$, $2b$, or $2y$)
      if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
        // This is a legacy bcrypt hash - use bcryptjs for verification
        const bcrypt = await import('bcryptjs');
        return await bcrypt.compare(password, hash);
      }

      // This should be our new Web Crypto hash - decode and verify
      // Add validation for base64 string
      if (!hash || typeof hash !== 'string') {
        console.error('Invalid hash format:', hash);
        return false;
      }

      // Decode base64 more safely
      const binaryString = atob(hash.trim());
      const combined = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        combined[i] = binaryString.charCodeAt(i);
      }

      // Extract salt and stored key
      const salt = combined.slice(0, this.SALT_LENGTH);
      const storedKey = combined.slice(this.SALT_LENGTH);

      // Convert password to ArrayBuffer
      const passwordBuffer = new TextEncoder().encode(password);

      // Import the password as a key
      const passwordKey = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        'PBKDF2',
        false,
        ['deriveBits']
      );

      // Derive the key using the same parameters
      const derivedKey = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: this.ITERATIONS,
          hash: 'SHA-256'
        },
        passwordKey,
        this.KEY_LENGTH * 8
      );

      // Compare the derived key with the stored key
      const derivedKeyArray = new Uint8Array(derivedKey);

      if (derivedKeyArray.length !== storedKey.length) {
        return false;
      }

      // Constant-time comparison
      let result = 0;
      for (let i = 0; i < derivedKeyArray.length; i++) {
        result |= derivedKeyArray[i] ^ storedKey[i];
      }

      return result === 0;
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }
}