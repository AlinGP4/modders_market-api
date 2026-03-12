// src/auth/auth.guard.ts (FINAL)
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(' ')[1];
    
    if (!token) return false;

    const { data: { user } } = await this.supabase.client.auth.getUser(token);
    
    // FIXED: añade user al request
    request.user = user;
    return !!user;
  }
}
