'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { PageHeader } from '@/components/admin/page-header';
import { DataTable } from '@/components/admin/data-table';
import { FilterBar } from '@/components/admin/filter-bar';
import { PersonCell } from '@/components/admin/person-cell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, Badge } from '@/components/ui/feedback';
import { Field, Input, Select, fieldAria } from '@/components/ui/form-controls';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { adminUsersApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import type { AdminUser } from '@/lib/api/types';
import { useMe } from '@/lib/auth/use-auth';
import { applyApiError } from '@/lib/forms';
import { formatDate, formatPhone, humanize } from '@/lib/format';
import { emailField, passwordField, phoneField } from '@/lib/schemas/auth';
import { useUrlParams } from '@/lib/use-url-params';

const PAGE_SIZE = 20;

const staffSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80),
  email: emailField,
  phone: phoneField,
  password: passwordField,
  role: z.enum(['SALES_AGENT', 'ADMIN']),
});
type StaffValues = z.input<typeof staffSchema>;
type StaffOutput = z.output<typeof staffSchema>;

function CreateStaffDialog({ open, onOpenChange, canMakeAdmin }: { open: boolean; onOpenChange: (o: boolean) => void; canMakeAdmin: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StaffValues, unknown, StaffOutput>({
    resolver: zodResolver(staffSchema),
    defaultValues: { name: '', email: '', phone: '', password: '', role: 'SALES_AGENT' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await adminUsersApi.createStaff(values);
      await qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'staff'] });
      toast.success(`${values.name} can now sign in`);
      reset();
      onOpenChange(false);
    } catch (e) {
      setFormError(applyApiError(e, setError, ['name', 'email', 'phone', 'password', 'role']));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a team member" description="They sign in with this email and temporary password." side="right">
        <form onSubmit={onSubmit} method="post" noValidate className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <Field label="Full name" htmlFor="staff-name" error={errors.name?.message} required>
            <Input {...fieldAria('staff-name', errors.name?.message)} {...register('name')} />
          </Field>
          <Field label="Email" htmlFor="staff-email" error={errors.email?.message} required>
            <Input type="email" {...fieldAria('staff-email', errors.email?.message)} {...register('email')} />
          </Field>
          <Field label="Mobile number" htmlFor="staff-phone" error={errors.phone?.message} required>
            <Input type="tel" inputMode="tel" {...fieldAria('staff-phone', errors.phone?.message)} {...register('phone')} />
          </Field>
          <Field label="Temporary password" htmlFor="staff-password" error={errors.password?.message} hint="At least 8 characters. Ask them to change it." required>
            <Input type="password" autoComplete="new-password" {...fieldAria('staff-password', errors.password?.message, 'x')} {...register('password')} />
          </Field>
          <Field label="Role" htmlFor="staff-role" error={errors.role?.message} required>
            <Select {...fieldAria('staff-role', errors.role?.message)} {...register('role')}>
              <option value="SALES_AGENT">Sales agent (sees assigned leads)</option>
              {canMakeAdmin && <option value="ADMIN">Admin (manages everything)</option>}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Create account
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UsersList() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const { get, set, page } = useUrlParams();
  const role = get('role') || 'STAFF';
  const status = get('status');
  const [creating, setCreating] = React.useState(false);
  const [toggling, setToggling] = React.useState<AdminUser | null>(null);
  const isSuper = !!me?.roles.includes('SUPER_ADMIN');

  // "Staff" is the default view: the API filters one role at a time, so fetch agents and admins when unfiltered.
  const query = useQuery({
    queryKey: ['admin', 'users', { role, status, page }],
    queryFn: async () => {
      if (role !== 'STAFF') return adminUsersApi.list({ role, status, page, pageSize: PAGE_SIZE });
      const [agents, admins] = await Promise.all([
        adminUsersApi.list({ role: 'SALES_AGENT', status, page, pageSize: PAGE_SIZE }),
        adminUsersApi.list({ role: 'ADMIN', status, page, pageSize: PAGE_SIZE }),
      ]);
      return {
        data: [...admins.data, ...agents.data],
        meta: { page, pageSize: PAGE_SIZE, total: agents.meta.total + admins.meta.total },
      };
    },
    placeholderData: (prev) => prev,
  });

  const flip = useMutation({
    mutationFn: (u: AdminUser) => adminUsersApi.setStatus(u.id, u.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED'),
    onSuccess: async (u) => {
      toast.success(u.status === 'DISABLED' ? `${u.name} was signed out and disabled` : `${u.name} is active again`);
      setToggling(null);
      await qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'staff'] });
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setToggling(null);
    },
  });

  const columns = React.useMemo<ColumnDef<AdminUser>[]>(
    () => [
      {
        header: 'Name',
        cell: ({ row: { original: u } }) => (
          <PersonCell name={u.name} sub={u.email} href={`/admin/users/${u.id}`} />
        ),
      },
      { header: 'Mobile', cell: ({ row }) => formatPhone(row.original.phone) },
      { header: 'Role', cell: ({ row }) => row.original.roles.map(humanize).join(', ') },
      {
        header: 'Status',
        cell: ({ row: { original: u } }) => (
          <Badge tone={u.status === 'ACTIVE' ? 'success' : u.status === 'LOCKED' ? 'warning' : 'danger'}>{humanize(u.status)}</Badge>
        ),
      },
      { header: 'Added', cell: ({ row }) => formatDate(row.original.createdAt) },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row: { original: u } }) => {
          const protectedRow = u.id === me?.id || u.roles.includes('SUPER_ADMIN') || (u.roles.includes('ADMIN') && !isSuper);
          if (protectedRow) return null;
          return (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setToggling(u)}>
                {u.status === 'DISABLED' ? 'Enable' : 'Disable'}
              </Button>
            </div>
          );
        },
      },
    ],
    [me?.id, isSuper],
  );

  const meta = query.data?.meta;

  return (
    <>
      <PageHeader
        title="Staff"
        description="People who can sign in to this admin area."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Add team member
          </Button>
        }
      />

      <FilterBar
        summary={meta ? `${meta.total.toLocaleString('en-IN')} ${meta.total === 1 ? 'person' : 'people'}` : undefined}
        onClear={get('role') || status ? () => set({ role: null, status: null }) : undefined}
      >
        <div className="w-44">
          <Select aria-label="Filter by role" value={role} onChange={(e) => set({ role: e.target.value === 'STAFF' ? null : e.target.value })}>
            <option value="STAFF">All staff</option>
            <option value="SALES_AGENT">Sales agents</option>
            <option value="ADMIN">Admins</option>
            <option value="CUSTOMER">Customers</option>
          </Select>
        </div>
        <div className="w-44">
          <Select aria-label="Filter by status" value={status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Any status</option>
            <option value="ACTIVE">Active</option>
            <option value="DISABLED">Disabled</option>
            <option value="LOCKED">Locked</option>
          </Select>
        </div>
      </FilterBar>

      <DataTable
        caption="Users"
        columns={columns}
        data={query.data?.data}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => query.refetch()}
        getRowId={(u) => u.id}
        emptyTitle="No people match"
        emptyDescription="Try a different role or status."
      />
      {meta && <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPageChange={(p) => set({ page: p }, { keepPage: true })} />}

      {creating && <CreateStaffDialog open onOpenChange={setCreating} canMakeAdmin={isSuper} />}
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.status === 'DISABLED' ? `Enable ${toggling?.name}?` : `Disable ${toggling?.name}?`}
        description={
          toggling?.status === 'DISABLED'
            ? 'They will be able to sign in again.'
            : 'They are signed out everywhere immediately and cannot sign in until re-enabled.'
        }
        confirmLabel={toggling?.status === 'DISABLED' ? 'Enable' : 'Disable'}
        tone={toggling?.status === 'DISABLED' ? 'primary' : 'danger'}
        loading={flip.isPending}
        onConfirm={() => toggling && flip.mutate(toggling)}
      />
    </>
  );
}
