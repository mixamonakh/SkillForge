import { Module } from '@nestjs/common';

import { MasteryModule } from '../mastery/mastery.module.js';
import { BattleEvidenceController } from './battle-evidence.controller.js';
import { BattleEvidenceService } from './battle-evidence.service.js';

@Module({
  imports: [MasteryModule],
  controllers: [BattleEvidenceController],
  providers: [BattleEvidenceService],
})
export class BattleEvidenceModule {}
