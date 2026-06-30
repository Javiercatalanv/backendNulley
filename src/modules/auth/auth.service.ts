import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Valida usuario/contraseña contra las variables de entorno.
   * ADMIN_USER: nombre de usuario en texto plano.
   * ADMIN_PASSWORD_HASH: hash bcrypt de la contraseña (NUNCA la contraseña en texto).
   */
  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const adminUser = this.configService.get<string>('ADMIN_USER');
    const adminHash = this.configService.get<string>('ADMIN_PASSWORD_HASH');

    if (!adminUser || !adminHash) {
      // Mal configurado en el servidor: no revelar detalles al cliente.
      throw new UnauthorizedException('Authentication is not configured');
    }

    // Comparar usuario (constante) y contraseña (bcrypt).
    const userMatches = dto.username === adminUser;
    const passwordMatches = await bcrypt.compare(dto.password, adminHash);

    if (!userMatches || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // El payload identifica al portador como admin. Sin datos sensibles.
    const payload = { sub: adminUser, role: 'admin' };
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken };
  }
}