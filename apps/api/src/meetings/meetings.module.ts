import { Module } from '@nestjs/common';
import { PresenceModule } from '../presence/presence.module';
import { LiveKitService } from './livekit.service';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

@Module({
  imports: [PresenceModule],
  controllers: [MeetingsController],
  providers: [LiveKitService, MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
