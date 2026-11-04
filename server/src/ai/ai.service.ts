import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class AiService {
  private aiInstance: GoogleGenAI | null = null;

  private getAiClient(): GoogleGenAI {
    if (!this.aiInstance) {
      this.aiInstance = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY || 'missing-api-key',
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    return this.aiInstance;
  }

  async searchMaps(body: { query?: string; latitude?: number; longitude?: number }) {
    const { query, latitude, longitude } = body;
    if (!query) {
      throw new HttpException(
        { error: 'Query is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const config: any = {
        tools: [{ googleMaps: {} }],
      };

      if (latitude && longitude) {
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: Number(latitude),
              longitude: Number(longitude),
            },
          },
        };
      }

      const response = await this.getAiClient().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `O'zbekiston hududidagi qurilish ob'ektlari, qurilish mollari bozorlari, beton zavodlari yoki logistika terminallari bo'yicha so'rov: ${query}. Aniq manzil, xususiyatlar va tafsilotlarni ko'rsating.`,
        config,
      });

      const groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const text = response.text || '';

      const places = groundingChunks
        .filter((chunk: any) => chunk.maps)
        .map((chunk: any) => ({
          title: chunk.maps.title || 'Qurilish joyi',
          uri: chunk.maps.uri || '',
          placeAnswerSources: chunk.maps.placeAnswerSources || null,
        }));

      return {
        text,
        places,
        groundingChunks,
      };
    } catch (error: any) {
      return {
        text: `Qurilish so'rovi: ${query}`,
        places: [],
        groundingChunks: [],
      };
    }
  }

  async calculateEsco(body: any) {
    const {
      buildingType,
      areaM2,
      currentEnergyUsage,
      wallMaterial,
      windowType,
    } = body || {};

    const prompt = `Siz BunkerStroy ESCO (Energiya Servis Kompaniyasi) bosh energetik muhandisisiz.
Bino parametrlari:
- Bino turi: ${buildingType}
- Maydoni: ${areaM2} m²
- Oylik/yillik energiya xarajati: ${currentEnergyUsage} kVt/soat
- Devor konstruksiyasi: ${wallMaterial || 'Pishiq gisht'}
- Deraza turi: ${windowType || 'Oddiy plastik'}

Quyidagi parametrlarni hisoblab, JSON formatida javob bering:
{
  "energySavingsPercent": son (masalan 35),
  "paybackYears": son (masalan 2.4),
  "annualSavingsSum": son (so'mda),
  "recommendedMaterials": ["tavsiya 1", "tavsiya 2", "tavsiya 3"],
  "co2ReductionTons": son
}`;

    try {
      const response = await this.getAiClient().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = response.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('AI ESCO calculation fallback', e);
    }

    const area = Number(areaM2) || 100;
    return {
      energySavingsPercent: 32,
      paybackYears: 2.5,
      annualSavingsSum: Math.round(area * 45000),
      recommendedMaterials: [
        'Bazalt izolyatsiya 100mm (BunkerStroy standart)',
        'Energiya tejovchi 3 qavatli kamerali romlar',
        'Inverter isitish va sovitish tizimi',
      ],
      co2ReductionTons: Math.round(area * 0.08),
    };
  }
}
