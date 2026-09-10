// Package mongostore MongoDB 存储实现(生产)。
// 集合:players / saves / league_run(docs/ARCHITECTURE.md §2.2)。
// 通过 ARK_MONGO_URI 启用,例如: mongodb://localhost:27017/ark_era
package mongostore

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"

	"ctwork/server/internal/store"
)

type MongoStore struct {
	cli *mongo.Client
	db  *mongo.Database
}

func New(ctx context.Context, uri, dbName string) (*MongoStore, error) {
	cli, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	pingCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	if err := cli.Ping(pingCtx, readpref.Primary()); err != nil {
		_ = cli.Disconnect(context.Background())
		return nil, fmt.Errorf("mongo ping: %w", err)
	}
	s := &MongoStore{cli: cli, db: cli.Database(dbName)}
	if err := s.ensureIndexes(ctx); err != nil {
		_ = s.Close()
		return nil, err
	}
	return s, nil
}

func (s *MongoStore) ensureIndexes(ctx context.Context) error {
	_, err := s.db.Collection("players").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "uid", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	return err
}

// —— players ——

func (s *MongoStore) CreatePlayer(p *store.Player) error {
	ctx, cancel := ctx5()
	defer cancel()
	key := lower(p.Account)
	doc := bson.M{"_id": key, "uid": p.UID, "account": p.Account, "passHash": p.PassHash, "createdAt": p.CreatedAt}
	if _, err := s.db.Collection("players").InsertOne(ctx, doc); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return store.ErrDuplicate
		}
		return err
	}
	return nil
}

func (s *MongoStore) playerByFilter(ctx context.Context, filter bson.M) (*store.Player, error) {
	var doc struct {
		UID       string `bson:"uid"`
		Account   string `bson:"account"`
		PassHash  string `bson:"passHash"`
		CreatedAt int64  `bson:"createdAt"`
	}
	err := s.db.Collection("players").FindOne(ctx, filter).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, store.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &store.Player{UID: doc.UID, Account: doc.Account, PassHash: doc.PassHash, CreatedAt: doc.CreatedAt}, nil
}

func (s *MongoStore) GetPlayerByAccount(accountLower string) (*store.Player, error) {
	ctx, cancel := ctx5()
	defer cancel()
	return s.playerByFilter(ctx, bson.M{"_id": accountLower})
}

func (s *MongoStore) GetPlayerByUID(uid string) (*store.Player, error) {
	ctx, cancel := ctx5()
	defer cancel()
	return s.playerByFilter(ctx, bson.M{"uid": uid})
}

// —— saves ——

func (s *MongoStore) GetSave(uid string) (*store.SaveRecord, error) {
	ctx, cancel := ctx5()
	defer cancel()
	var doc struct {
		Payload       string `bson:"payload"`
		ServerSavedAt int64  `bson:"serverSavedAt"`
	}
	err := s.db.Collection("saves").FindOne(ctx, bson.M{"_id": uid}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, store.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &store.SaveRecord{Payload: []byte(doc.Payload), ServerSavedAt: doc.ServerSavedAt}, nil
}

func (s *MongoStore) PutSave(uid string, rec *store.SaveRecord) error {
	ctx, cancel := ctx5()
	defer cancel()
	doc := bson.M{"_id": uid, "payload": string(rec.Payload), "serverSavedAt": rec.ServerSavedAt}
	_, err := s.db.Collection("saves").UpdateOne(ctx,
		bson.M{"_id": uid},
		bson.M{"$set": doc},
		options.Update().SetUpsert(true),
	)
	return err
}

func (s *MongoStore) DeleteSave(uid string) error {
	ctx, cancel := ctx5()
	defer cancel()
	_, err := s.db.Collection("saves").DeleteOne(ctx, bson.M{"_id": uid})
	return err
}

// —— league_run ——

func (s *MongoStore) UpsertLeague(e *store.LeagueEntry) error {
	ctx, cancel := ctx5()
	defer cancel()
	coll := s.db.Collection("league_run")
	doc := bson.M{"uid": e.UID, "account": e.Account, "runScore": e.RunScore, "runId": e.RunID, "escaped": e.Escaped, "ts": e.Ts}
	// 仅在更高分时覆盖(原子)
	res, err := coll.UpdateOne(ctx, bson.M{"_id": e.UID, "runScore": bson.M{"$lt": e.RunScore}}, bson.M{"$set": doc})
	if err == nil && res.MatchedCount == 0 {
		// 无更高分记录:不存在则插入
		_, _ = coll.UpdateOne(ctx, bson.M{"_id": e.UID},
			bson.M{"$setOnInsert": doc},
			options.Update().SetUpsert(true),
		)
	}
	return err
}

func (s *MongoStore) LeagueTop(n int) ([]store.LeagueEntry, error) {
	ctx, cancel := ctx5()
	defer cancel()
	if n <= 0 {
		n = 20
	}
	cur, err := s.db.Collection("league_run").Find(ctx, bson.M{},
		options.Find().SetSort(bson.D{{Key: "runScore", Value: -1}, {Key: "ts", Value: 1}}).SetLimit(int64(n)))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var list []store.LeagueEntry
	for cur.Next(ctx) {
		var e store.LeagueEntry
		if err := cur.Decode(&e); err != nil {
			return nil, err
		}
		list = append(list, e)
	}
	return list, cur.Err()
}

func (s *MongoStore) LeagueRank(uid string) (int64, int64, error) {
	ctx, cancel := ctx5()
	defer cancel()
	coll := s.db.Collection("league_run")
	var me struct {
		RunScore int64 `bson:"runScore"`
	}
	err := coll.FindOne(ctx, bson.M{"_id": uid}).Decode(&me)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return 0, 0, nil
	}
	if err != nil {
		return 0, 0, err
	}
	higher, err := coll.CountDocuments(ctx, bson.M{"runScore": bson.M{"$gt": me.RunScore}})
	if err != nil {
		return 0, 0, err
	}
	return higher + 1, me.RunScore, nil
}

func (s *MongoStore) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.cli.Disconnect(ctx)
}

// —— 工具 ——

func ctx5() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 5*time.Second)
}

func lower(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'A' && b[i] <= 'Z' {
			b[i] += 'a' - 'A'
		}
	}
	return string(b)
}
