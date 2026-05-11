import graphene
from graphene_sqlalchemy import SQLAlchemyObjectType
from models import User, Contribution

class UserType(SQLAlchemyObjectType):
    class Meta:
        model = User
        interfaces = (graphene.relay.Node,)

class ContributionType(SQLAlchemyObjectType):
    class Meta:
        model = Contribution
        interfaces = (graphene.relay.Node,)

class Query(graphene.ObjectType):
    node = graphene.relay.Node.Field()
    all_users = graphene.List(UserType)
    all_contributions = graphene.List(ContributionType)

    def resolve_all_users(root, info):
        return User.query.all()

    def resolve_all_contributions(root, info):
        return Contribution.query.all()

schema = graphene.Schema(query=Query)
