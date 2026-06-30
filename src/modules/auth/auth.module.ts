import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt.auth.guard';

/**
 * @Global hace que los providers exportados (JwtService vía JwtModule, y el
 * JwtAuthGuard) estén disponibles en TODOS los módulos sin tener que importar
 * AuthModule en cada uno. Esto resuelve el error "Nest can't resolve JwtService"
 * cuando un módulo (UploadModule, ResearchersModule) usa @UseGuards(JwtAuthGuard).
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') || '8h' },
      }),
    } as any),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}