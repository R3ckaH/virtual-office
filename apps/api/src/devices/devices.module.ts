import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { AdmsController } from './adms.controller';
import { DevicesController, DeviceUsersController } from './devices.controller';
import { DevicesService } from './devices.service';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';

/** Phase 2: biometric devices (cloud push, sync agent, file import) and badge links. */
@Module({
  imports: [AttendanceModule],
  controllers: [DevicesController, DeviceUsersController, IngestController, AdmsController],
  providers: [DevicesService, IngestService],
})
export class DevicesModule {}
