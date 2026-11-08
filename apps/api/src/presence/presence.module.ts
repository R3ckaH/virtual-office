import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { PresenceGateway } from './presence.gateway';
import { PresenceService } from './presence.service';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [AttendanceModule],
  controllers: [RoomsController],
  providers: [RoomsService, PresenceService, PresenceGateway],
  exports: [PresenceService, RoomsService],
})
export class PresenceModule {}
