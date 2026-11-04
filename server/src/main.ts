import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';
import {
  encodeProtobufPacket,
  decodeProtobufPacket,
  validateAndSanitizeInput,
} from '../../src/lib/protobufCodec';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  const logger = new Logger('BunkerServer');
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : true;

  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    },
    logger: ['log', 'error', 'warn'],
  });

  // Global bulletproof DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: false,
    })
  );

  // Global Exception Filter for safe, unified JSON errors
  app.useGlobalFilters(new AllExceptionsFilter());

  // Graceful shutdown on SIGTERM / SIGINT for zero-downtime rolling deploys
  app.enableShutdownHooks();

  const expressApp = app.getHttpAdapter().getInstance();

  // High-performance response compression (gzip / deflate / brotli)
  expressApp.use(compression());

  // Strict Enterprise Security Headers (Clickjacking, MIME Sniffing, HSTS)
  expressApp.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    next();
  });

  // Enterprise Swagger / OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('BunkerS Enterprise API')
    .setDescription(
      'BunkerStroy Construction Marketplace & ERP — 50/50 Escrow Transactions, B2B Factory Procurement, CRM Nasiya Daftari, and Heavy Logistics Fleet.'
    )
    .setVersion('2.0.0')
    .addTag('Authentication & Security', 'Foydalanuvchi va ta’minotchi avtorizatsiyasi, JWT tokenlar')
    .addTag('Payments & Gateways', 'Payme JSON-RPC 2.0 va Click to‘lov shlyuzlari integratsiyasi')
    .addTag('Products', 'Katalog va qurilish materiallari')
    .addTag('Orders & Escrow', 'Buyurtmalar va 50/50 kafolatlangan to\'lovlar')
    .addTag('Suppliers & Factories', 'Akkreditatsiyalangan zavod va distribyutorlar')
    .addTag('CRM POS & Nasiya Daftari', 'Do\'konlar uchun qarz va nasiya savdo daftari')
    .addTag('Heavy Logistics & Fleet', 'Og\'ir yuk transporti va avtomatik fraxt hisobi')
    .addTag('STIR & Soliq Registry', 'O\'zbekiston davlat soliq va yuridik shaxslar reestri')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'BunkerS API Documentation',
    swaggerOptions: { persistAuthorization: true },
  });

  const server = http.createServer(expressApp);

  // Gemini Live Multimodal Voice Assistant WebSocket Gateway
  const wss = new WebSocketServer({ server, path: '/api/live' });

  wss.on('connection', async (clientWs: WebSocket) => {
    logger.log('Gemini Live Voice Client connected to NestJS Gateway');
    let session: any = null;

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        clientWs.send(
          Buffer.from(
            encodeProtobufPacket({
              type: 'error',
              error: 'GEMINI_API_KEY sozlanmagan',
            })
          )
        );
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      session = await (ai as any).live.connect({
        model: 'gemini-2.0-flash-exp',
        config: {
          generationConfig: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Puck',
                },
              },
            },
          },
          systemInstruction: {
            parts: [
              {
                text: 'Siz BunkerStroy platformasining sun\'iy intellektli ovozli assistentisiz. Foydalanuvchilarga qurilish mollari (sement, armatura, gazoblok, bazalt), buyurtmalar va narxlar bo\'yicha o\'zbek tilida qisqa, aniq va xushmuomala javob bering.',
              },
            ],
          },
        },
        callbacks: {
          onmessage: (message: any) => {
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  clientWs.send(
                    Buffer.from(
                      encodeProtobufPacket({
                        type: 'audio',
                        audio: part.inlineData.data,
                      })
                    )
                  );
                }
                if (part.text) {
                  clientWs.send(
                    Buffer.from(
                      encodeProtobufPacket({
                        type: 'text',
                        text: part.text,
                      })
                    )
                  );
                }
              }
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(Buffer.from(encodeProtobufPacket({ type: 'interrupted' })));
            }
            if (message.serverContent?.turnComplete) {
              clientWs.send(Buffer.from(encodeProtobufPacket({ type: 'turnComplete' })));
            }
          },
          onclose: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(Buffer.from(encodeProtobufPacket({ type: 'session_closed' })));
            }
          },
          onerror: (err: any) => {
            logger.error(`Live API session error: ${err.message}`);
          },
        },
      });

      clientWs.on('message', (data: Buffer | Uint8Array | string) => {
        try {
          const rawBytes =
            typeof data === 'string'
              ? new Uint8Array(Buffer.from(data))
              : new Uint8Array(data as Buffer);
          const decoded = decodeProtobufPacket<any>(rawBytes);
          const validation = validateAndSanitizeInput(decoded.data);
          if (!validation.valid) return;
          const parsed = validation.sanitized || {};
          if (parsed.audio && session) {
            session.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (parsed.text && session) {
            session.sendRealtimeInput({
              text: parsed.text,
            });
          }
        } catch (err: any) {
          logger.warn(`Protobuf client input error: ${err.message}`);
        }
      });

      clientWs.on('close', () => {
        if (session) {
          try {
            session.close();
          } catch {}
        }
      });
    } catch (err: any) {
      logger.error(`Failed to initialize Voice Assistant: ${err.message}`);
    }
  });

  // Attach Vite middleware in development or static dist in production
  const isProduction = process.env.NODE_ENV === 'production';
  const projectRoot = path.resolve(__dirname, '../../');

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: projectRoot,
      server: { middlewareMode: true },
      appType: 'custom',
    });
    expressApp.use((req: Request, res: Response, next: NextFunction) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
        return next();
      }
      vite.middlewares(req, res, next);
    });
    // Fallback for SPA routing in development
    expressApp.use(async (req: Request, res: Response, next: NextFunction) => {
      if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/ws')) {
        return next();
      }
      try {
        const fs = await import('fs');
        let template = fs.readFileSync(path.resolve(projectRoot, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    expressApp.use(express.static(path.resolve(projectRoot, 'dist')));
    expressApp.use((req: Request, res: Response, next: NextFunction) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
        return next();
      }
      res.sendFile(path.resolve(projectRoot, 'dist', 'index.html'));
    });
  }

  const port = process.env.PORT || 3000;
  await app.init();
  server.listen(port, () => {
    logger.log(`🚀 BunkerS Enterprise NestJS Server running at http://localhost:${port}`);
    logger.log(`📖 Swagger OpenAPI Documentation available at http://localhost:${port}/api/docs`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
