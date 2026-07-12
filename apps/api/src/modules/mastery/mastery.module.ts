import { Global, Module } from '@nestjs/common';

import { MasteryService } from './mastery.service.js';

@Global()
@Module({
  providers: [MasteryService],
  exports: [MasteryService],
})
export class MasteryModule {}
