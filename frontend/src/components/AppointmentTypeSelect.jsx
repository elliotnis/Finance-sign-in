import { useEffect, useId, useRef, useState } from 'react';
import '../styles/appointmentTypeSelect.css';

function normalizeOption(option) {
    if (typeof option === 'string') {
        return {
            value: option,
            label: option,
            description: '',
            count: null,
            color: '',
            icon: '',
        };
    }

    return {
        value: option.value,
        label: option.label ?? option.value,
        description: option.description || '',
        count: option.count ?? null,
        color: option.color || '',
        icon: option.icon || '',
    };
}

function AppointmentTypeSelect({
    id,
    label,
    value,
    options,
    onChange,
    placeholder = 'Choose an appointment type',
    icon = 'fa-filter',
    disabled = false,
    compact = false,
    className = '',
}) {
    const generatedId = useId();
    const selectId = id || `appointment-type-${generatedId.replace(/:/g, '')}`;
    const labelId = `${selectId}-label`;
    const valueId = `${selectId}-value`;
    const listboxId = `${selectId}-listbox`;
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const optionRefs = useRef([]);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);

    const normalizedOptions = options.map(normalizeOption);
    const selectedIndex = normalizedOptions.findIndex((option) => option.value === value);
    const selectedOption = selectedIndex >= 0 ? normalizedOptions[selectedIndex] : null;

    useEffect(() => {
        function handleOutsidePointer(event) {
            if (rootRef.current && !rootRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }

        function handleEscape(event) {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        }

        document.addEventListener('pointerdown', handleOutsidePointer);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('pointerdown', handleOutsidePointer);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    useEffect(() => {
        if (isOpen) {
            optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
        }
    }, [activeIndex, isOpen]);

    function openMenu(preferredIndex = selectedIndex >= 0 ? selectedIndex : 0) {
        if (disabled || normalizedOptions.length === 0) return;
        setActiveIndex(Math.max(0, Math.min(preferredIndex, normalizedOptions.length - 1)));
        setIsOpen(true);
    }

    function chooseOption(option) {
        onChange(option.value);
        setIsOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
    }

    function handleTriggerClick() {
        if (isOpen) {
            setIsOpen(false);
        } else {
            openMenu();
        }
    }

    function handleTriggerKeyDown(event) {
        if (disabled || normalizedOptions.length === 0) return;

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!isOpen) {
                const nextIndex = selectedIndex >= 0
                    ? selectedIndex
                    : event.key === 'ArrowDown' ? 0 : normalizedOptions.length - 1;
                openMenu(nextIndex);
                return;
            }

            const direction = event.key === 'ArrowDown' ? 1 : -1;
            setActiveIndex((current) => (
                (current + direction + normalizedOptions.length) % normalizedOptions.length
            ));
            return;
        }

        if (event.key === 'Home' && isOpen) {
            event.preventDefault();
            setActiveIndex(0);
            return;
        }

        if (event.key === 'End' && isOpen) {
            event.preventDefault();
            setActiveIndex(normalizedOptions.length - 1);
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (isOpen) {
                chooseOption(normalizedOptions[activeIndex]);
            } else {
                openMenu();
            }
            return;
        }

        if (event.key === 'Escape' && isOpen) {
            event.preventDefault();
            setIsOpen(false);
        }

        if (event.key === 'Tab') {
            setIsOpen(false);
        }
    }

    return (
        <div
            className={`appointment-type-select ${compact ? 'appointment-type-select--compact' : ''} ${isOpen ? 'is-open' : ''} ${className}`}
            ref={rootRef}
        >
            <span className="appointment-type-select__label" id={labelId}>
                {label}
            </span>
            <button
                type="button"
                id={selectId}
                ref={triggerRef}
                className="appointment-type-select__trigger"
                role="combobox"
                aria-controls={listboxId}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-labelledby={`${labelId} ${valueId}`}
                aria-activedescendant={isOpen ? `${selectId}-option-${activeIndex}` : undefined}
                disabled={disabled}
                onClick={handleTriggerClick}
                onKeyDown={handleTriggerKeyDown}
            >
                <span className="appointment-type-select__trigger-icon" aria-hidden="true">
                    <i className={`fas ${icon}`}></i>
                </span>
                <span className="appointment-type-select__selection" id={valueId}>
                    <strong>{selectedOption?.label || placeholder}</strong>
                    {!compact && (
                        <small>{selectedOption?.description || 'Select a type to narrow the appointments shown'}</small>
                    )}
                </span>
                {selectedOption && selectedOption.count !== null && (
                    <span className="appointment-type-select__count" aria-label={`${selectedOption.count} appointments`}>
                        {selectedOption.count}
                    </span>
                )}
                <span className="appointment-type-select__chevron" aria-hidden="true">
                    <i className="fas fa-chevron-down"></i>
                </span>
            </button>

            {isOpen && (
                <div className="appointment-type-select__popover">
                    <div className="appointment-type-select__popover-heading">
                        <span>Browse by type</span>
                        <small>{normalizedOptions.length} choices</small>
                    </div>
                    <ul
                        className="appointment-type-select__options"
                        id={listboxId}
                        role="listbox"
                        aria-labelledby={labelId}
                    >
                        {normalizedOptions.map((option, index) => {
                            const isSelected = option.value === value;
                            const isActive = index === activeIndex;
                            return (
                                <li
                                    key={option.value}
                                    id={`${selectId}-option-${index}`}
                                    ref={(node) => {
                                        optionRefs.current[index] = node;
                                    }}
                                    className={`${isSelected ? 'is-selected' : ''} ${isActive ? 'is-active' : ''}`}
                                    role="option"
                                    aria-selected={isSelected}
                                    style={option.color ? { '--appointment-option-color': option.color } : undefined}
                                    onPointerMove={() => setActiveIndex(index)}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => chooseOption(option)}
                                >
                                    <span className="appointment-type-select__option-mark" aria-hidden="true">
                                        {option.icon ? (
                                            <i className={`fas ${option.icon}`}></i>
                                        ) : (
                                            <span></span>
                                        )}
                                    </span>
                                    <span className="appointment-type-select__option-copy">
                                        <strong>{option.label}</strong>
                                        {option.description && <small>{option.description}</small>}
                                    </span>
                                    {option.count !== null && (
                                        <span className="appointment-type-select__option-count">
                                            {option.count}
                                        </span>
                                    )}
                                    <span className="appointment-type-select__option-check" aria-hidden="true">
                                        <i className="fas fa-check"></i>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}

export default AppointmentTypeSelect;
