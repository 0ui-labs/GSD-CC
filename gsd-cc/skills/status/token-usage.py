#!/usr/bin/env python3
"""Calculate total token usage from Claude Code session data."""

import json
import os
import sys
import glob
import argparse
import re


def encode_project_path(path):
    """Encode a filesystem path to Claude Code's project directory name."""
    return re.sub(r'[/_]', '-', path)


def find_project_dir(cwd):
    """Find the Claude Code project directory for the given working directory."""
    base = os.path.expanduser('~/.claude/projects')
    encoded = encode_project_path(cwd)
    candidate = os.path.join(base, encoded)
    if os.path.isdir(candidate):
        return candidate

    # Fallback: search sessions metadata for matching cwd
    sessions_dir = os.path.expanduser('~/.claude/sessions')
    if os.path.isdir(sessions_dir):
        session_ids = set()
        for sf in glob.glob(os.path.join(sessions_dir, '*.json')):
            try:
                with open(sf) as f:
                    meta = json.load(f)
                if meta.get('cwd') == cwd:
                    session_ids.add(meta['sessionId'])
            except (json.JSONDecodeError, KeyError, IOError):
                continue

        if session_ids:
            # Find which project dir contains these sessions
            for proj_dir in glob.glob(os.path.join(base, '*')):
                if not os.path.isdir(proj_dir):
                    continue
                for jf in glob.glob(os.path.join(proj_dir, '*.jsonl')):
                    basename = os.path.splitext(os.path.basename(jf))[0]
                    if basename in session_ids:
                        return proj_dir

    return None


def extract_usage(record):
    """Extract usage dict and message id from a session record."""
    msg_type = record.get('type', '')

    if msg_type == 'assistant':
        msg = record.get('message', {})
        if isinstance(msg, dict):
            return msg.get('id'), msg.get('usage')

    elif msg_type == 'progress':
        data = record.get('data', {})
        if isinstance(data, dict):
            msg = data.get('message', {})
            if isinstance(msg, dict):
                return msg.get('id'), msg.get('usage')

    return None, None


def process_jsonl(filepath, usages):
    """Read a JSONL file and collect usage data, deduplicating by message id."""
    try:
        with open(filepath) as f:
            for line in f:
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                msg_id, usage = extract_usage(record)
                if usage and msg_id:
                    usages[msg_id] = usage
                elif usage and not msg_id:
                    # No id available — use a generated key to avoid losing data
                    usages[f'_anon_{id(usage)}_{len(usages)}'] = usage
    except IOError:
        pass


# Pricing per million tokens (USD)
MODEL_PRICING = {
    'sonnet': {
        'input': 3.00,
        'output': 15.00,
        'cache_read': 0.30,
        'cache_write': 3.75,
    },
    'opus': {
        'input': 15.00,
        'output': 75.00,
        'cache_read': 1.50,
        'cache_write': 18.75,
    },
    'haiku': {
        'input': 0.80,
        'output': 4.00,
        'cache_read': 0.08,
        'cache_write': 1.00,
    },
}


def estimate_cost(input_tokens, output_tokens, cache_creation, cache_read, model='sonnet'):
    """Estimate API cost in USD based on token counts and model pricing."""
    pricing = MODEL_PRICING.get(model, MODEL_PRICING['sonnet'])
    cost = (
        input_tokens * pricing['input']
        + output_tokens * pricing['output']
        + cache_creation * pricing['cache_write']
        + cache_read * pricing['cache_read']
    ) / 1_000_000
    return cost


def format_tokens(count):
    """Format token count as human-readable string."""
    if count >= 1_000_000_000:
        return f'{count / 1_000_000_000:.1f}B'
    if count >= 1_000_000:
        return f'{count / 1_000_000:.1f}M'
    if count >= 1_000:
        return f'{count / 1_000:.1f}k'
    return str(count)


def print_costs_breakdown(costs_file):
    """Print auto-mode breakdown by phase and slice from COSTS.jsonl."""
    try:
        with open(costs_file) as f:
            lines = [json.loads(l) for l in f if l.strip()]
    except (IOError, json.JSONDecodeError):
        return

    if not lines:
        return

    total = sum(
        l.get('usage', {}).get('input_tokens', 0) + l.get('usage', {}).get('output_tokens', 0)
        for l in lines
    )
    if total == 0:
        return

    phases = {}
    slices = {}
    for l in lines:
        t = l.get('usage', {}).get('input_tokens', 0) + l.get('usage', {}).get('output_tokens', 0)
        p = l.get('phase', '?')
        unit = l.get('unit', '?')
        s = unit.split('-')[0] if '-' in unit else unit
        phases[p] = phases.get(p, 0) + t
        slices[s] = slices.get(s, 0) + t

    phase_str = ' \u00b7 '.join(f'{k} {v * 100 // total}%' for k, v in sorted(phases.items()))
    slice_str = ' \u00b7 '.join(f'{k} {v * 100 // total}%' for k, v in sorted(slices.items()))
    print(f'  Auto-mode by phase: {phase_str}')
    print(f'  Auto-mode by slice: {slice_str}')


def main():
    parser = argparse.ArgumentParser(description='Calculate token usage from Claude Code sessions')
    parser.add_argument('--cwd', default=os.getcwd(), help='Project working directory')
    parser.add_argument('--json', action='store_true', dest='json_output', help='Output as JSON')
    parser.add_argument('--costs', metavar='FILE', help='Path to COSTS.jsonl for auto-mode breakdown')
    parser.add_argument('--model', default='sonnet', choices=MODEL_PRICING.keys(),
                        help='Model for cost estimate (default: sonnet)')
    args = parser.parse_args()

    project_dir = find_project_dir(os.path.abspath(args.cwd))
    if not project_dir:
        if args.json_output:
            print(json.dumps({'error': 'no_session_data'}))
        else:
            print('Token usage: no session data found')
        sys.exit(0)

    # Collect all JSONL files: main sessions + subagents
    session_files = glob.glob(os.path.join(project_dir, '*.jsonl'))
    subagent_files = glob.glob(os.path.join(project_dir, '*/subagents/agent-*.jsonl'))

    # Extract usage from all files, deduplicating by message id
    usages = {}
    for f in session_files:
        process_jsonl(f, usages)

    subagent_usages = {}
    for f in subagent_files:
        process_jsonl(f, subagent_usages)

    # Aggregate
    def sum_field(usage_dict, field):
        return sum(u.get(field, 0) for u in usage_dict.values())

    input_tokens = sum_field(usages, 'input_tokens') + sum_field(subagent_usages, 'input_tokens')
    output_tokens = sum_field(usages, 'output_tokens') + sum_field(subagent_usages, 'output_tokens')
    cache_creation = sum_field(usages, 'cache_creation_input_tokens') + sum_field(subagent_usages, 'cache_creation_input_tokens')
    cache_read = sum_field(usages, 'cache_read_input_tokens') + sum_field(subagent_usages, 'cache_read_input_tokens')

    session_count = len(session_files)
    api_call_count = len(usages) + len(subagent_usages)

    cost = estimate_cost(input_tokens, output_tokens, cache_creation, cache_read, args.model)

    if args.json_output:
        print(json.dumps({
            'input_tokens': input_tokens,
            'output_tokens': output_tokens,
            'cache_creation_input_tokens': cache_creation,
            'cache_read_input_tokens': cache_read,
            'session_count': session_count,
            'api_call_count': api_call_count,
            'subagent_api_calls': len(subagent_usages),
            'estimated_cost_usd': round(cost, 2),
            'cost_model': args.model,
        }))
    else:
        print('Token Usage (all sessions)')
        print(f'  Sessions:    {session_count:>8}')
        print(f'  API calls:   {api_call_count:>8}')
        print(f'  Input:       {format_tokens(input_tokens):>8} tokens')
        print(f'  Output:      {format_tokens(output_tokens):>8} tokens')
        print(f'  Cache write: {format_tokens(cache_creation):>8} tokens')
        print(f'  Cache read:  {format_tokens(cache_read):>8} tokens')
        print(f'  Est. cost:   {cost:>7.2f}$ ({args.model} pricing)')

    if args.costs and not args.json_output:
        print_costs_breakdown(args.costs)


if __name__ == '__main__':
    main()
