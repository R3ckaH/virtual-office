import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { env } from '../config/env';

export interface AccessClaims {
  sub: string;
  sid: string;
  typ: 'access';
}
interface MfaClaims {
  sub: string;
  typ: 'mfa';
}

/** Signs short-lived access tokens (Authorization: Bearer) and the MFA step-up token. */
@Injectable()
export class TokensService {
  constructor(private readonly jwt: JwtService) {}

  signAccess(userId: string, sessionId: string): string {
    return this.jwt.sign(
      { sub: userId, sid: sessionId, typ: 'access' } satisfies AccessClaims,
      { expiresIn: env().ACCESS_TOKEN_TTL_SECONDS },
    );
  }

  verifyAccess(token: string): AccessClaims {
    try {
      const c = this.jwt.verify<AccessClaims>(token);
      if (c.typ !== 'access' || !c.sid) throw new Error('wrong token type');
      return c;
    } catch {
      throw new UnauthorizedException({ message: 'Your session has expired. Please sign in again.', code: 'TOKEN_INVALID' });
    }
  }

  signMfa(userId: string): string {
    return this.jwt.sign({ sub: userId, typ: 'mfa' } satisfies MfaClaims, { expiresIn: 300 });
  }

  verifyMfa(token: string): string {
    try {
      const c = this.jwt.verify<MfaClaims>(token);
      if (c.typ !== 'mfa') throw new Error('wrong token type');
      return c.sub;
    } catch {
      throw new UnauthorizedException({ message: 'That sign-in attempt expired. Please start again.', code: 'MFA_EXPIRED' });
    }
  }
}
