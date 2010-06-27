require('../express/lib/express')

configure(function(){ set('root', "."); })

get('/', function(){
    this.contentType('html');
    return 'hello world';
})

run();
