"""Flask CLI commands: `flask seed` and `flask check-consistency`."""
import click
from flask import current_app
from sqlalchemy import func, select

from app import run_details
from app.extensions import db
from app.models import Researcher
from app.run_service import find_inconsistencies
from app.seed import reset_demo_data, seed_database


def register_commands(app):
    @app.cli.command("seed")
    @click.option("--reset", is_flag=True, help="Delete existing demo data before seeding.")
    @click.option("--yes", is_flag=True, help="Do not ask for confirmation when using --reset.")
    def seed_command(reset, yes):
        """Seed PostgreSQL and MongoDB with fictional demo data.

        Refuses to run when APP_ENV=production, and refuses to touch a database
        that already contains data unless --reset is given.
        """
        if current_app.config["APP_ENV"] == "production":
            raise click.ClickException("Refusing to seed when APP_ENV=production.")

        existing = db.session.scalar(select(func.count(Researcher.id)))
        if existing and not reset:
            raise click.ClickException(
                f"Database already contains {existing} researchers. Re-run with --reset to replace the demo data."
            )
        try:
            if reset:
                if not yes:
                    click.confirm(
                        "This deletes ALL researchers, experiments and runs (PostgreSQL and MongoDB). Continue?",
                        abort=True,
                    )
                reset_demo_data()
            counts = seed_database()
        except run_details.DetailsStoreError as exc:
            raise click.ClickException(f"MongoDB is unavailable ({exc}). Is `docker compose up -d` running?")

        click.echo(
            f"Seeded {counts['researchers']} researchers, {counts['experiments']} experiments, "
            f"and {counts['runs']} runs (with details in MongoDB)."
        )

    @app.cli.command("check-consistency")
    @click.option("--delete-orphans", is_flag=True, help="Delete MongoDB documents that have no PostgreSQL run.")
    def check_consistency_command(delete_orphans):
        """Report runs whose PostgreSQL and MongoDB records do not match."""
        missing_details, orphans = find_inconsistencies()
        click.echo(f"Runs without MongoDB details: {len(missing_details)} {missing_details[:20] or ''}")
        click.echo(f"MongoDB documents without a run: {len(orphans)} {orphans[:20] or ''}")
        if orphans and delete_orphans:
            deleted = run_details.delete_many(orphans)
            click.echo(f"Deleted {deleted} orphaned MongoDB documents.")
        elif orphans:
            click.echo("Re-run with --delete-orphans to remove them.")
