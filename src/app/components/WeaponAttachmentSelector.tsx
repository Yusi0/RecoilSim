import React, { useMemo } from 'react';
import { SUPPORTED_WEAPONS, getAvailableAttachmentsForWeapon } from '../c25DataLoader';
import { SelectedAttachments } from '../../core/compiler/WeaponCompiler';

interface WeaponAttachmentSelectorProps {
    currentWeaponId: string;
    selectedAttachments: SelectedAttachments;
    onSelectWeapon: (weaponId: string) => void;
    onChangeAttachment: (slot: string, attachmentName: string | undefined) => void;
    onResetAttachments: () => void;
}

export const WeaponAttachmentSelector: React.FC<WeaponAttachmentSelectorProps> = ({
    currentWeaponId,
    selectedAttachments,
    onSelectWeapon,
    onChangeAttachment,
    onResetAttachments
}) => {
    const slots = [
        { id: 'Barrel', label: '총구 / 총열' },
        { id: 'Underbarrel', label: '손잡이' },
        { id: 'Optics', label: '조준경' },
        { id: 'Other', label: '기타' },
        { id: 'Ammo', label: '탄약' }
    ];

    const availableSlots = useMemo(() => {
        return getAvailableAttachmentsForWeapon(currentWeaponId);
    }, [currentWeaponId]);

    const hasAnyAttachment = Object.values(selectedAttachments).some(
        (val) => val && val !== 'DEFAULT' && val !== ''
    );

    return (
        <div className="w-full h-full p-5 bg-[#141416] flex flex-col font-sans select-none overflow-y-auto">
            {/* Header: Clean label without heavy borders */}
            <div className="flex items-center justify-between pb-3 border-b border-[#1f1f23] mb-5">
                <span className="text-xs font-semibold text-[#8e8e93] uppercase tracking-wider font-mono">
                    설정
                </span>
                {hasAnyAttachment && (
                    <button
                        onClick={onResetAttachments}
                        className="text-[11px] text-[#7c7c82] hover:text-[#ef4444] transition-colors"
                    >
                        부착물 초기화
                    </button>
                )}
            </div>

            {/* 1. Weapon Selection Dropdown (Pure Name without RPM/Mag redundancy) */}
            <div className="mb-5 flex flex-col gap-1.5">
                <label className="text-[11px] text-[#7c7c82]">
                    무기
                </label>
                <div className="relative">
                    <select
                        value={currentWeaponId}
                        onChange={(e) => onSelectWeapon(e.target.value)}
                        className="w-full h-8 px-2.5 bg-[#1c1c1f] hover:bg-[#232327] text-[#f0f0f2] rounded text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#3b82f6] cursor-pointer appearance-none transition-colors border-0"
                    >
                        {SUPPORTED_WEAPONS.map((w) => (
                            <option key={w.id} value={w.id} className="bg-[#1c1c1f] text-[#f0f0f2]">
                                {w.displayName}
                            </option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-[#636366] text-[10px]">
                        ▼
                    </div>
                </div>
            </div>

            {/* 2. Attachment Slots Dropdowns (Compact height, neutral text, borderless) */}
            <div className="flex-1 flex flex-col gap-3.5">
                <div className="text-[11px] text-[#7c7c82] uppercase tracking-wider font-mono">
                    부착물
                </div>

                {slots.map(({ id: slotName, label }) => {
                    const options = availableSlots[slotName] || [];
                    const currentValue = selectedAttachments[slotName] || '';

                    return (
                        <div key={slotName} className="flex flex-col gap-1">
                            <label className="text-[11px] text-[#8e8e93]">
                                {label}
                            </label>
                            <div className="relative">
                                <select
                                    value={currentValue}
                                    onChange={(e) =>
                                        onChangeAttachment(
                                            slotName,
                                            e.target.value === '' ? undefined : e.target.value
                                        )
                                    }
                                    className={`w-full h-8 px-2.5 bg-[#1c1c1f] hover:bg-[#232327] rounded text-xs font-mono cursor-pointer appearance-none focus:outline-none focus:ring-1 focus:ring-[#3b82f6] transition-colors border-0 ${
                                        currentValue ? 'text-[#ffffff] font-medium' : 'text-[#636366]'
                                    }`}
                                >
                                    <option value="" className="bg-[#1c1c1f] text-[#8e8e93]">
                                        기본 (None)
                                    </option>
                                    {options.map((att) => (
                                        <option key={att} value={att} className="bg-[#1c1c1f] text-[#f0f0f2]">
                                            {att}
                                        </option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-[#636366] text-[9px]">
                                    ▼
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
