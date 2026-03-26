import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Category, Channel } from '@/types';
import { channelsApi } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ChannelType = 'text' | 'voice';

interface Props {
  open: boolean;
  guildId: string;
  categories: Category[];
  defaultType?: ChannelType;
  defaultCategoryId?: string | null;
  onClose: () => void;
  onCreated?: (channelId: string) => void;
}

export default function CreateChannelModal({
  open,
  guildId,
  categories,
  defaultType = 'text',
  defaultCategoryId = null,
  onClose,
  onCreated,
}: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>(defaultType);
  const [categoryId, setCategoryId] = useState<string>(defaultCategoryId ?? '');
  const [topic, setTopic] = useState('');
  const [isNsfw, setIsNsfw] = useState(false);
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () =>
      channelsApi.create(guildId, {
        name: name.trim(),
        type,
        category_id: categoryId || undefined,
        topic: topic.trim() || undefined,
        is_nsfw: isNsfw ? true : undefined,
      }),
    onSuccess: (channel) => {
      // Immediately add to cache so the channel is available when onCreated navigates to it
      qc.setQueryData<Channel[]>(['channels', guildId], (old) =>
        old ? [...old, channel] : [channel],
      );
      qc.invalidateQueries({ queryKey: ['channels', guildId] });
      handleClose();
      onCreated?.(channel.id);
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleClose() {
    setName('');
    setType(defaultType);
    setCategoryId(defaultCategoryId ?? '');
    setTopic('');
    setIsNsfw(false);
    setError('');
    onClose();
  }

  const inputStyle = { background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' };
  const labelStyle = { color: 'var(--text-muted)' };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--text-primary)' }}>{t('channel.createChannel')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Channel type */}
          <div>
            <label className="text-xs font-semibold uppercase mb-2 block" style={labelStyle}>
              {t('channel.channelType')}
            </label>
            <div className="flex gap-2">
              {(['text', 'voice'] as ChannelType[]).map((ct) => (
                <button
                  key={ct}
                  onClick={() => setType(ct)}
                  className="flex-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
                  style={{
                    background: type === ct ? 'var(--accent)' : 'var(--bg-primary)',
                    color: type === ct ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${type === ct ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}`,
                  }}
                >
                  {ct === 'text' ? <HashIcon /> : <VoiceIcon />}
                  {t(`channel.type_${ct}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs font-semibold uppercase mb-1 block" style={labelStyle}>
              {t('channel.channelName')}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'text' ? t('channel.textChannelPlaceholder') : t('channel.voiceChannelPlaceholder')}
              maxLength={100}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && create.mutate()}
              style={inputStyle}
            />
          </div>

          {/* Category */}
          {categories.length > 0 && (
            <div>
              <label className="text-xs font-semibold uppercase mb-1 block" style={labelStyle}>
                {t('channel.category')}
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-md px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                <option value="">{t('channel.noCategory')}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Topic (text channels only) */}
          {type === 'text' && (
            <div>
              <label className="text-xs font-semibold uppercase mb-1 block" style={labelStyle}>
                {t('channel.topic')} ({t('channel.optional')})
              </label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t('channel.topicPlaceholder')}
                maxLength={1024}
                style={inputStyle}
              />
            </div>
          )}

          {/* NSFW toggle (text channels only) */}
          {type === 'text' && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isNsfw}
                onChange={(e) => setIsNsfw(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {t('channel.nsfw')}
              </span>
            </label>
          )}

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={handleClose} style={{ color: 'var(--text-secondary)' }}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={!name.trim() || create.isPending}
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {create.isPending ? t('common.loading') : t('common.create')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

function VoiceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
