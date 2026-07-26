"""The CLI's argument namespace must satisfy every command it can dispatch to.

Composite commands such as ``bootstrap`` call other command functions with the
namespace they were handed. If a flag is declared only on the subparser that
owns it, the composite command raises ``AttributeError`` part way through, which
is the worst time to find out: ``bootstrap`` had already applied the migrations
before it failed.

Rather than list the flags by hand, these tests read every ``args.<name>`` each
command function touches, follow calls between them, and check the namespace
argparse actually builds for each subcommand.
"""

from __future__ import annotations

import argparse
import ast
import inspect
from pathlib import Path

import pytest

from fintech_demo import cli

SOURCE = ast.parse(Path(inspect.getfile(cli)).read_text(encoding="utf-8"))
MODULE_FUNCTIONS = {
    node.name: node for node in SOURCE.body if isinstance(node, ast.FunctionDef)
}
COMMAND_FUNCTIONS = {
    name: node for name, node in MODULE_FUNCTIONS.items() if name.startswith("cmd_")
}


def direct_attributes(function: ast.FunctionDef) -> set[str]:
    """Names read as ``args.<name>`` inside one function."""
    found = set()
    for node in ast.walk(function):
        if (
            isinstance(node, ast.Attribute)
            and isinstance(node.value, ast.Name)
            and node.value.id == "args"
        ):
            found.add(node.attr)
    return found


def delegates(function: ast.FunctionDef) -> set[str]:
    """Functions in this module that ``function`` calls with the namespace.

    Helpers count as well as other commands: ``_settings(args)`` reads five
    attributes, and a command that reached it through a helper would fail in
    exactly the same way.
    """
    found = set()
    for node in ast.walk(function):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name):
            continue
        if node.func.id not in MODULE_FUNCTIONS:
            continue
        passes_args = any(
            isinstance(argument, ast.Name) and argument.id == "args" for argument in node.args
        )
        if passes_args or node.func.id in COMMAND_FUNCTIONS:
            found.add(node.func.id)
    return found


def required_attributes(name: str, seen: frozenset[str] = frozenset()) -> set[str]:
    """Everything ``name`` reads from the namespace, including via delegation."""
    if name in seen:
        return set()
    function = MODULE_FUNCTIONS[name]
    attributes = direct_attributes(function)
    for target in delegates(function):
        attributes |= required_attributes(target, seen | {name})
    return attributes


def subcommands() -> dict[str, argparse.ArgumentParser]:
    parser = cli.build_parser()
    action = next(a for a in parser._actions if isinstance(a, argparse._SubParsersAction))
    return dict(action.choices)


def namespace_for(name: str, subparser: argparse.ArgumentParser) -> argparse.Namespace:
    """Parse the subcommand with placeholders for any required positional."""
    argv = [name]
    for action in subparser._get_positional_actions():
        argv.append("PLACEHOLDER")
    return cli.build_parser().parse_args(argv)


@pytest.mark.parametrize("name", sorted(subcommands()))
def test_namespace_satisfies_every_command_it_dispatches(name: str) -> None:
    subparser = subcommands()[name]
    namespace = namespace_for(name, subparser)
    function = namespace.func.__name__
    missing = {
        attribute
        for attribute in required_attributes(function)
        if attribute != "func" and not hasattr(namespace, attribute)
    }
    assert not missing, f"`{name}` dispatches to {function}, which reads {sorted(missing)}"


def test_every_subcommand_binds_a_command_function() -> None:
    for name, subparser in subcommands().items():
        handler = subparser.get_default("func")
        assert handler is not None, f"{name} has no handler"
        assert handler.__name__ in COMMAND_FUNCTIONS


def test_bootstrap_runs_migrate_seed_and_reset_in_that_order() -> None:
    """Bootstrap is the documented first command; its order is load-bearing."""
    body = ast.unparse(COMMAND_FUNCTIONS["cmd_bootstrap"])
    order = [step for step in ("cmd_migrate", "cmd_seed", "cmd_reset") if step in body]
    assert order == ["cmd_migrate", "cmd_seed", "cmd_reset"]
    assert body.index("cmd_migrate") < body.index("cmd_seed") < body.index("cmd_reset")


def test_documented_commands_exist() -> None:
    """The module docstring is the first thing an operator reads."""
    available = set(subcommands())
    for line in (cli.__doc__ or "").splitlines():
        stripped = line.strip()
        if not stripped.startswith("python -m fintech_demo "):
            continue
        command = stripped.split()[3]
        assert command in available, f"docstring names unknown command `{command}`"
