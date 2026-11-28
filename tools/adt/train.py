import numpy as np, json, sys
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
NAMES=['kick','snare','hhC','hhO','tomH','tomM','tomL','ride','crash']
def load(f):
    rows=[l.split(',') for l in open(f).read().strip().split('\n')]
    X=np.array([[float(v) for v in r[2:2+46]] for r in rows],np.float32); Y=np.array([[int(v) for v in r[48:57]] for r in rows]); return X,Y
Xtr,Ytr=load('train.csv'); Xte,Yte=load('test.csv')
print('train',Xtr.shape,'test',Xte.shape,'positives per class (train)',dict(zip(NAMES,Ytr.sum(0))))
sc=StandardScaler().fit(Xtr)
clf=MLPClassifier(hidden_layer_sizes=(64,32),alpha=1e-3,max_iter=300,early_stopping=True,validation_fraction=0.1,random_state=0,learning_rate_init=2e-3,batch_size=256)
clf.fit(sc.transform(Xtr),Ytr)
P=clf.predict_proba(sc.transform(Xte))
def report(P,Y,th=0.5):
    out=[]
    for c,n in enumerate(NAMES):
        p=P[:,c]>th; y=Y[:,c]==1; tp=(p&y).sum()
        out.append(f"{n}:{tp/max(1,y.sum())*100:.0f}/{tp/max(1,p.sum())*100:.0f}")
    return ' '.join(out)
print('held-out kits, recall/precision per class:',report(P,Yte))
json.dump({'mean':sc.mean_.tolist(),'scale':sc.scale_.tolist(),'W':[w.round(5).tolist() for w in clf.coefs_],'b':[b.round(5).tolist() for b in clf.intercepts_]},open('model.json','w'))
np.save('Pte.npy',P)
