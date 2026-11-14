import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RedirectIfSignedIn, RequireAuth, RequireModule, RequirePermission } from '@/components/layout/guards';
import { AuditLogPage } from '@/pages/admin/AuditLogPage';
import { DepartmentsPage } from '@/pages/admin/DepartmentsPage';
import { DevicesPage } from '@/pages/admin/DevicesPage';
import { HrAttendancePage } from '@/pages/admin/HrAttendancePage';
import { LoginHistoryPage } from '@/pages/admin/LoginHistoryPage';
import { MeetingSettingsPage } from '@/pages/admin/MeetingSettingsPage';
import { RoomsPage } from '@/pages/admin/RoomsPage';
import { SchedulesPage } from '@/pages/admin/SchedulesPage';
import { UsersPage } from '@/pages/admin/UsersPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { AttendancePage } from '@/pages/attendance/AttendancePage';
import { FloorPage } from '@/pages/floor/FloorPage';
import { HomePage } from '@/pages/HomePage';
import { ChatPage } from '@/pages/chat/ChatPage';
import { LeavePage } from '@/pages/leave/LeavePage';
import { TasksPage } from '@/pages/tasks/TasksPage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { LeaveSettingsPage } from '@/pages/admin/LeaveSettingsPage';
import { CompanySettingsPage } from '@/pages/admin/CompanySettingsPage';
import { MeetingsPage } from '@/pages/meetings/MeetingsPage';
import { ProfilePage } from '@/pages/settings/ProfilePage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<RedirectIfSignedIn><LoginPage /></RedirectIfSignedIn>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<HomePage />} />
        <Route path="floor" element={<FloorPage />} />
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="chat/:channelId" element={<ChatPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="reports" element={<RequirePermission permission="reports.read"><ReportsPage /></RequirePermission>} />
        <Route path="settings/profile" element={<ProfilePage />} />
        <Route path="admin/users" element={<RequirePermission permission="users.manage"><UsersPage /></RequirePermission>} />
        <Route path="admin/attendance" element={<RequirePermission permission="attendance.manage"><HrAttendancePage /></RequirePermission>} />
        <Route path="admin/schedules" element={<RequirePermission permission="attendance.manage"><SchedulesPage /></RequirePermission>} />
        <Route path="admin/devices" element={<RequireModule module="devices"><RequirePermission permission="devices.manage"><DevicesPage /></RequirePermission></RequireModule>} />
        <Route path="admin/rooms" element={<RequirePermission permission="rooms.manage"><RoomsPage /></RequirePermission>} />
        <Route path="admin/meetings" element={<RequirePermission permission="settings.manage"><MeetingSettingsPage /></RequirePermission>} />
        <Route path="admin/leave" element={<RequirePermission permission="leave.manage"><LeaveSettingsPage /></RequirePermission>} />
        <Route path="admin/company" element={<RequirePermission permission="settings.manage"><CompanySettingsPage /></RequirePermission>} />
        <Route path="admin/departments" element={<RequirePermission permission="departments.manage"><DepartmentsPage /></RequirePermission>} />
        <Route path="admin/login-history" element={<RequirePermission permission="authEvents.read"><LoginHistoryPage /></RequirePermission>} />
        <Route path="admin/audit-log" element={<RequirePermission permission="auditLogs.read"><AuditLogPage /></RequirePermission>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
