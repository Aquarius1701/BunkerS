import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MyIdService } from './myid.service';

@ApiTags('MyID & Davlat ID Karta Integratsiyasi')
@Controller('api')
export class MyIdController {
  constructor(private readonly myIdService: MyIdService) {}

  @Post('myid/verify-phone-ownership')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Telefon raqam ID karta egasiga tegishli ekanligini tekshirish' })
  @ApiResponse({ status: 200, description: 'Raqam tasdiqlandi' })
  verifyPhoneOwnership(@Body() body: any) {
    return this.myIdService.verifyPhoneOwnership(body);
  }

  @Post('myid/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ID karta va tug‘ilgan sana bo‘yicha MyID verifikatsiyasi' })
  @ApiResponse({ status: 200, description: 'Shaxs ma’lumotlari topildi' })
  verifyMyId(@Body() body: any) {
    return this.myIdService.verifyMyId(body);
  }

  @Post('mygov/id-lookup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'MyGov ID qidiruvi' })
  lookupMyGovId(@Body() body: any) {
    return this.myIdService.verifyMyId(body);
  }
}
