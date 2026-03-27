import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { guildsApi, rolesApi } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Guild, GuildMember, MemberRole, Role } from '@/types';

interface Props {
  guild: Guild;
  onClose: () => void;
}

export default function GuildSettings({ guild, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'roles'>('overview');
  const [name, setName] = useState(guild.name);
  const [error, setError] = useState('');
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState('0');
  const [roleHoist, setRoleHoist] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const save = useMutation({
    mutationFn: () => guildsApi.update(guild.id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guilds'] });
      setError('');
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ['roles', guild.id],
    queryFn: () => rolesApi.list(guild.id),
  });
  const { data: members = [] } = useQuery<GuildMember[]>({
    queryKey: ['guildMembers', guild.id],
    queryFn: () => guildsApi.members(guild.id),
  });
  const { data: memberRoles = [] } = useQuery<MemberRole[]>({
    queryKey: ['memberRoles', guild.id],
    queryFn: () => rolesApi.listMemberRoles(guild.id),
  });

  const createRole = useMutation({
    mutationFn: () =>
      rolesApi.create(guild.id, {
        name: roleName.trim(),
        color: Number(roleColor) || 0,
        permissions: 0,
        hoist: roleHoist,
        position: roles.length,
      }),
    onSuccess: () => {
      setRoleName('');
      setRoleColor('0');
      setRoleHoist(false);
      qc.invalidateQueries({ queryKey: ['roles', guild.id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateRole = useMutation({
    mutationFn: (role: Role) => rolesApi.update(guild.id, role.id, { hoist: !role.hoist }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles', guild.id] }),
    onError: (e: Error) => setError(e.message),
  });

  const assignRole = useMutation({
    mutationFn: () => rolesApi.assignToMember(guild.id, selectedRoleId, selectedUserId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memberRoles', guild.id] });
      setSelectedRoleId('');
      setSelectedUserId('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const removeRole = useMutation({
    mutationFn: () => rolesApi.removeFromMember(guild.id, selectedRoleId, selectedUserId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memberRoles', guild.id] });
      setSelectedRoleId('');
      setSelectedUserId('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const memberRoleCountByRole = useMemo(() => {
    const counts = new Map<string, number>();
    for (const mr of memberRoles) counts.set(mr.role_id, (counts.get(mr.role_id) ?? 0) + 1);
    return counts;
  }, [memberRoles]);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--text-primary)' }}>{t('guild.settings')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="flex gap-2">
            <Button variant={tab === 'overview' ? 'default' : 'ghost'} onClick={() => setTab('overview')}>
              {t('guild.settings_overview')}
            </Button>
            <Button variant={tab === 'roles' ? 'default' : 'ghost'} onClick={() => setTab('roles')}>
              {t('guild.roles')}
            </Button>
          </div>

          {tab === 'overview' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  {t('guild.server_name')}
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  style={{ background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          )}

          {tab === 'roles' && (
            <div className="space-y-4">
              <div className="rounded-md p-3" style={{ background: 'var(--bg-primary)' }}>
                <p className="mb-2 text-sm font-semibold">{t('guild.create_role')}</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <Input
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder={t('guild.role_name')}
                  />
                  <Input
                    value={roleColor}
                    onChange={(e) => setRoleColor(e.target.value)}
                    placeholder={t('guild.role_color')}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={roleHoist} onChange={(e) => setRoleHoist(e.target.checked)} />
                    {t('guild.show_separately')}
                  </label>
                </div>
                <div className="mt-2">
                  <Button
                    onClick={() => createRole.mutate()}
                    disabled={!roleName.trim() || createRole.isPending}
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    {createRole.isPending ? t('common.loading') : t('common.create')}
                  </Button>
                </div>
              </div>

              <div className="rounded-md p-3" style={{ background: 'var(--bg-primary)' }}>
                <p className="mb-2 text-sm font-semibold">{t('guild.roles')}</p>
                <div className="space-y-2">
                  {roles.map((role) => (
                    <div key={role.id} className="flex items-center justify-between rounded px-2 py-1" style={{ background: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center gap-2 text-sm">
                        <span>●</span>
                        <span>{role.name}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {t('guild.members_count', { count: memberRoleCountByRole.get(role.id) ?? 0 })}
                        </span>
                      </div>
                      {!role.is_default && (
                        <Button size="sm" variant="ghost" onClick={() => updateRole.mutate(role)}>
                          {role.hoist ? t('guild.hide_separate') : t('guild.show_separately')}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md p-3" style={{ background: 'var(--bg-primary)' }}>
                <p className="mb-2 text-sm font-semibold">{t('guild.assign_role')}</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <select
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                    className="h-9 rounded-md px-2 text-sm"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                  >
                    <option value="">{t('guild.select_role')}</option>
                    {roles.filter((r) => !r.is_default).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="h-9 rounded-md px-2 text-sm"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                  >
                    <option value="">{t('guild.select_member')}</option>
                    {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.user.display_name || m.user.username}</option>)}
                  </select>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    onClick={() => assignRole.mutate()}
                    disabled={!selectedRoleId || !selectedUserId || assignRole.isPending}
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    {t('guild.assign_role')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => removeRole.mutate()}
                    disabled={!selectedRoleId || !selectedUserId || removeRole.isPending}
                  >
                    {t('guild.remove_role')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} style={{ color: 'var(--text-secondary)' }}>
              {t('common.cancel')}
            </Button>
            {tab === 'overview' && (
              <Button
                onClick={() => save.mutate()}
                disabled={!name.trim() || save.isPending}
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {save.isPending ? t('common.loading') : t('common.save')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
